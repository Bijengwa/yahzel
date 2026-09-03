# Phase 6 — Organizational Intelligence & Operational Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an operational-intelligence layer (`intelligence` module) that derives signals, an attention center, an organization overview, an activity feed, organization search, and person operational history from Yahzel's existing Phase 1–5 records — without duplicating Work, Projects, People, Employment, Contracts, or Notifications, and without a second scheduler or permission system.

**Architecture:** One new backend module `node/src/intelligence/` (record/repository/service×5/controller/routes), mounted at `/api/intelligence`, reusing existing detection logic (`classifyWorkItem`/`computeAndSync` from Work's stalled scan, `computeAndSyncExpiry` from contract expiry, `computeProjectHealth` from Project health) by exporting a handful of previously-private functions/constants rather than re-implementing them. One new table, `operational_signals`, persists derived facts with a sticky-resolve model (manual resolution is not reopened by a later scan while the same condition persists). Everything else (Overview/Activity/Search/Person History) is read-only aggregation over existing tables — no new tables for those. Frontend adds five screens under a new `OrganisationTabs` sub-nav, reusing the existing panel/button/field design system verbatim.

**Tech Stack:** Node/Express/Knex/PostgreSQL backend (TypeScript, ESM, `tsx`), Next.js/React frontend (TypeScript, Tailwind via the existing `yz-*` design tokens). Tests follow this repo's existing convention: HTTP-driven E2E check scripts under `node/scripts/`, run against a live `npm run dev` server — there is no unit-test framework in this repo, so this plan does not introduce one.

## Global Constraints

- Do NOT create Next.js API routes. All backend logic lives in `node/`.
- Do NOT create a second scheduler, notification system, or permission system. Reuse `requireOccupancyCapability` for authorization and `createNotification` for any notification (none are added net-new by this phase — the existing stalled/expiry scans already notify; Phase 6 only adds a queryable signal on top).
- No employee scores, rankings, ratings, or leaderboards anywhere in this phase.
- Every new organization-scoped endpoint requires `requireAuth` + an organization-membership/capability check that never leaks cross-organization data (a foreign id reads as 404, never 403 revealing existence).
- Follow existing conventions exactly: `<Feature>Error` class per module with `.field()` static helper, `service`/`repository`/`controller`/`routes` file split, `public<Thing>()` serializers, Knex migrations numbered sequentially, `npm run check:<name>` E2E scripts that create-then-delete their own fixtures against a running dev server.
- Money/permission semantics already established: **admin-only** (`requireOccupancyCapability`) gates every existing organization-wide operational/aggregate view (work settings, capabilities, schedules, stalled work, expiring contracts, occupancy history, employment, hierarchy, departments). Phase 6's Overview/Attention/Activity/Search/Person-History endpoints follow this same precedent and are admin-only too — this is a deliberate, documented decision (see Task 9), not an oversight.
- Person-level addressing in this codebase uses `organisation_members.id` ("memberId"), never a raw profile id, in every existing org-scoped person route (`/api/hierarchy/:organisationId/members/:memberId/...`, `/api/employment/:organisationId/members/:memberId`). Phase 6's Person History endpoint follows this convention: `/api/intelligence/:organisationId/members/:memberId/history` — a deliberate adaptation of the spec's suggested `/profiles/:profileId/history` path, per the spec's own instruction to match established conventions.

---

## Task 1 — Migration 021: `operational_signals` table + `intelligence.record.ts`

**Files:**
- Create: `node/src/db/migrations/021_phase6_intelligence.ts`
- Create: `node/src/intelligence/intelligence.record.ts`

**Interfaces:**
- Produces: `OPERATIONAL_SIGNALS_TABLE`, `OperationalSignalRecord`, `SIGNAL_TYPES`/`SignalType`, `SIGNAL_ENTITY_TYPES`/`SignalEntityType`, `SIGNAL_STATUSES`/`SignalStatus`, `SIGNAL_SEVERITIES`/`SignalSeverity`, `SIGNAL_RESOLUTIONS`/`SignalResolution` — every later task imports from here.

- [ ] **Step 1: Write the migration**

```ts
// node/src/db/migrations/021_phase6_intelligence.ts
import type { Knex } from "knex";

/**
 * Phase 6 — the one new table this phase needs. `operational_signals` is a
 * derived-facts cache over existing records (Work, Projects, Outcomes,
 * Contracts): it never becomes a second source of truth for any of them, and
 * every row can be recomputed at any time from the tables it references.
 *
 * `entity_type` + `entity_id` is a loose (non-FK) reference on purpose: the
 * entity a signal points at varies by row (work_items, projects,
 * project_outcomes, contracts), and a single foreign key cannot span four
 * tables. `organisation_id` still carries a real FK so a signal is always
 * deleted with its organisation.
 *
 * Sticky resolution: a signal's identity is (organisation_id, type,
 * entity_type, entity_id) — a real unique index. Re-running the scan updates
 * an *active* row's message/severity in place (never re-notifies, mirroring
 * work_stall_notices) and marks a row *resolved* the moment its condition is
 * no longer detected. A *manually* resolved row is left alone by later scans
 * even if the same condition is still present — see
 * intelligence.signal.service.ts for why.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("operational_signals", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    // Dotted signal name, e.g. "work.overdue". See intelligence.record.ts.
    table.string("type", 40).notNullable();

    // work_item | project | project_outcome | contract. See the note above.
    table.string("entity_type", 30).notNullable();
    table.integer("entity_id").unsigned().notNullable();

    // active | resolved.
    table.string("status", 20).notNullable().defaultTo("active");

    // normal | high. Factual urgency only — never a performance judgement.
    table.string("severity", 20).notNullable().defaultTo("normal");

    // Already a rendered sentence, like project_events.message and
    // notifications.message — never reassembled from a template on read.
    table.text("message").notNullable();

    table
      .timestamp("detected_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.timestamp("resolved_at", { useTz: true }).nullable();

    table
      .integer("resolved_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("profiles")
      .onDelete("SET NULL");

    // manual | condition_cleared. Null while active.
    table.string("resolution", 20).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(
      ["organisation_id", "type", "entity_type", "entity_id"],
      "operational_signals_identity_unique",
    );
    table.index(["organisation_id", "status"], "operational_signals_org_status_index");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("operational_signals");
}
```

- [ ] **Step 2: Write `intelligence.record.ts`**

```ts
// node/src/intelligence/intelligence.record.ts
export const OPERATIONAL_SIGNALS_TABLE = "operational_signals";

/**
 * Every signal type this phase detects. Adding one is a code change here
 * plus a detector in intelligence.signal.service.ts — never a migration.
 */
export const SIGNAL_TYPES = [
  "work.overdue",
  "work.blocked",
  "work.stalled",
  "project.inactive",
  "project.target_approaching",
  "outcome.overdue",
  "contract.expiring",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export function isSignalType(value: string): value is SignalType {
  return (SIGNAL_TYPES as readonly string[]).includes(value);
}

export const SIGNAL_ENTITY_TYPES = [
  "work_item",
  "project",
  "project_outcome",
  "contract",
] as const;

export type SignalEntityType = (typeof SIGNAL_ENTITY_TYPES)[number];

export const SIGNAL_STATUSES = ["active", "resolved"] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export const SIGNAL_SEVERITIES = ["normal", "high"] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];

export const SIGNAL_RESOLUTIONS = ["manual", "condition_cleared"] as const;
export type SignalResolution = (typeof SIGNAL_RESOLUTIONS)[number];

export type OperationalSignalRecord = {
  id: number;
  organisation_id: number;
  type: string;
  entity_type: string;
  entity_id: number;
  status: string;
  severity: string;
  message: string;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 3: Run the migration**

Run: `cd node && npm run db:migrate`
Expected: `Batch N run: 1 migrations` including `021_phase6_intelligence.ts`, no errors.

- [ ] **Step 4: Commit**

```bash
git add node/src/db/migrations/021_phase6_intelligence.ts node/src/intelligence/intelligence.record.ts
git commit -m "feat(phase6): add operational_signals table and intelligence record types"
```

---

## Task 2 — Extend existing modules with the small reads/exports Phase 6 needs

Every addition here is either (a) a one-word `export` added to an already-correct private function/constant, or (b) a small new read-only repository function following the exact shape of its neighbors in the same file. Nothing here changes existing behavior.

**Files:**
- Modify: `node/src/work/work.stalled.service.ts`
- Modify: `node/src/employment/employment.expiry.service.ts`
- Modify: `node/src/projects/project.health.service.ts`
- Modify: `node/src/projects/project.service.ts`
- Modify: `node/src/organisation/organisation.service.ts`
- Modify: `node/src/work/work.repository.ts`
- Modify: `node/src/projects/project.repository.ts`
- Modify: `node/src/employment/employment.repository.ts`
- Modify: `node/src/hierarchy/occupancy.repository.ts`

**Interfaces:**
- Produces: `computeAndSync` (exported, work.stalled.service.ts), `computeAndSyncExpiry` (exported, employment.expiry.service.ts), `APPROACHING_TARGET_DAYS`/`INACTIVE_PROJECT_DAYS` (exported, project.health.service.ts), `publicProject`/`publicOutcome` (exported, project.service.ts), `publicMembership` (exported, organisation.service.ts), `listWorkItemsForOrganisation`/`listReportsForOrganisation`/`listAttachmentsForOrganisation` (work.repository.ts), `listProjectEventsForOrganisation`/`listOutcomesForOrganisation`/`listProjectMembershipsForProfile` (project.repository.ts), `listEmploymentRecordsForOrganisation`/`listContractsForOrganisation` (employment.repository.ts), `listOccupancyHistoryForOrganisation` (occupancy.repository.ts).

- [ ] **Step 1: Export `computeAndSync` in `node/src/work/work.stalled.service.ts`**

Change line 122 from:
```ts
async function computeAndSync(organisationId: number): Promise<StalledDiagnostic[]> {
```
to:
```ts
export async function computeAndSync(organisationId: number): Promise<StalledDiagnostic[]> {
```

- [ ] **Step 2: Export `computeAndSyncExpiry` in `node/src/employment/employment.expiry.service.ts`**

Change line 88 from:
```ts
async function computeAndSyncExpiry(
```
to:
```ts
export async function computeAndSyncExpiry(
```

- [ ] **Step 3: Export the two thresholds in `node/src/projects/project.health.service.ts`**

Change:
```ts
const APPROACHING_TARGET_DAYS = 14;
const INACTIVE_PROJECT_DAYS = 8;
```
to:
```ts
export const APPROACHING_TARGET_DAYS = 14;
export const INACTIVE_PROJECT_DAYS = 8;
```

- [ ] **Step 4: Export `publicProject` and `publicOutcome` in `node/src/projects/project.service.ts`**

Change:
```ts
function publicProject(record: ProjectRecord) {
```
to:
```ts
export function publicProject(record: ProjectRecord) {
```
and
```ts
function publicOutcome(record: ProjectOutcomeRecord) {
```
to:
```ts
export function publicOutcome(record: ProjectOutcomeRecord) {
```

- [ ] **Step 5: Export `publicMembership` in `node/src/organisation/organisation.service.ts`**

Change:
```ts
function publicMembership(record: OrganisationMemberRecord) {
```
to:
```ts
export function publicMembership(record: OrganisationMemberRecord) {
```

- [ ] **Step 6: Add organization-wide reads to `node/src/work/work.repository.ts`**

Add near `listOpenWorkItemsForOrganisation` (after its closing brace):

```ts
/**
 * Every Work Item in an organisation, any status — Overview/Search/Activity
 * need the full set, not just the open ones listOpenWorkItemsForOrganisation
 * already serves the stalled scan.
 */
export function listWorkItemsForOrganisation(
  organisationId: number,
): Promise<WorkItemRecord[]> {
  return db<WorkItemRecord>(ITEMS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");
}
```

Add near the end of the "Reports" section (after `insertReport`/`updateReportBody`/`transitionReport`, before the attachments section):

```ts
/** Every report in an organisation — Activity's feed and Person History's authored-reports view both filter this in memory rather than each needing their own query. */
export function listReportsForOrganisation(
  organisationId: number,
): Promise<WorkReportRecord[]> {
  return db<WorkReportRecord>(REPORTS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");
}
```

Add near the end of the attachments section:

```ts
/** Every report attachment in an organisation — same reuse as listReportsForOrganisation. */
export function listAttachmentsForOrganisation(
  organisationId: number,
): Promise<WorkReportAttachmentRecord[]> {
  return db<WorkReportAttachmentRecord>(ATTACHMENTS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");
}
```

- [ ] **Step 7: Add organization-wide reads to `node/src/projects/project.repository.ts`**

Add after `listProjectEvents`:

```ts
/** Every project event across an organisation, newest first — Activity's feed. */
export function listProjectEventsForOrganisation(
  organisationId: number,
  limit = 200,
): Promise<ProjectEventRecord[]> {
  return db<ProjectEventRecord>(EVENTS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc")
    .limit(limit);
}
```

Add after `updateOutcome`:

```ts
/** Every outcome across an organisation — Search and Person History (owned outcomes). */
export function listOutcomesForOrganisation(
  organisationId: number,
): Promise<ProjectOutcomeRecord[]> {
  return db<ProjectOutcomeRecord>(OUTCOMES)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");
}
```

Add after `listProjects`:

```ts
/** Every project in an organisation that a profile is a contributor on (not owner — see project.record.ts's own note that the owner is not duplicated into project_members). */
export function listProjectMembershipsForProfile(
  organisationId: number,
  profileId: number,
): Promise<ProjectRecord[]> {
  return db<ProjectRecord>(PROJECTS)
    .join(MEMBERS, `${MEMBERS}.project_id`, `${PROJECTS}.id`)
    .where(`${MEMBERS}.profile_id`, profileId)
    .andWhere(`${PROJECTS}.organisation_id`, organisationId)
    .select<ProjectRecord[]>(`${PROJECTS}.*`);
}
```

- [ ] **Step 8: Add organization-wide reads to `node/src/employment/employment.repository.ts`**

Add after `updateEmploymentRecord`:

```ts
/** Every employment record in an organisation — Activity's feed and Person History. */
export function listEmploymentRecordsForOrganisation(
  organisationId: number,
): Promise<EmploymentRecordRecord[]> {
  return db<EmploymentRecordRecord>(EMPLOYMENT_RECORDS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");
}
```

Add after `updateContract`:

```ts
/** Every contract in an organisation — Activity's feed. */
export function listContractsForOrganisation(
  organisationId: number,
): Promise<ContractRecord[]> {
  return db<ContractRecord>(CONTRACTS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");
}
```

- [ ] **Step 9: Add an organization-wide occupancy read to `node/src/hierarchy/occupancy.repository.ts`**

Add after `listActiveOccupancies`:

```ts
/** Every occupancy an organisation has ever had (current and ended) — Activity's feed. */
export function listOccupancyHistoryForOrganisation(
  organisationId: number,
): Promise<PositionOccupancyRecord[]> {
  return db<PositionOccupancyRecord>(OCCUPANCIES)
    .where({ organisation_id: organisationId })
    .orderBy("starts_at", "desc");
}
```

- [ ] **Step 10: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors (these are additive-only changes; nothing that imported the now-exported names changes shape).

- [ ] **Step 11: Commit**

```bash
git add node/src/work/work.stalled.service.ts node/src/employment/employment.expiry.service.ts node/src/projects/project.health.service.ts node/src/projects/project.service.ts node/src/organisation/organisation.service.ts node/src/work/work.repository.ts node/src/projects/project.repository.ts node/src/employment/employment.repository.ts node/src/hierarchy/occupancy.repository.ts
git commit -m "feat(phase6): export existing detection logic and add org-wide reads for intelligence to reuse"
```

---

## Task 3 — `intelligence.repository.ts`: signals CRUD

**Files:**
- Create: `node/src/intelligence/intelligence.repository.ts`

**Interfaces:**
- Consumes: `OPERATIONAL_SIGNALS_TABLE`, `OperationalSignalRecord` (Task 1).
- Produces: `findSignalByIdentity`, `insertSignal`, `updateSignalFields`, `markSignalAutoResolved`, `markSignalResolvedManually`, `findSignalById`, `listActiveSignals`, `listAllSignals` — consumed by Task 4.

- [ ] **Step 1: Write the repository**

```ts
// node/src/intelligence/intelligence.repository.ts
import { db } from "../db/knex.js";
import {
  OPERATIONAL_SIGNALS_TABLE,
  type OperationalSignalRecord,
} from "./intelligence.record.js";

const SIGNALS = OPERATIONAL_SIGNALS_TABLE;
const now = () => db.fn.now() as unknown as string;

export function findSignalById(
  id: number,
): Promise<OperationalSignalRecord | undefined> {
  return db<OperationalSignalRecord>(SIGNALS).where({ id }).first();
}

export function findSignalByIdentity(
  organisationId: number,
  type: string,
  entityType: string,
  entityId: number,
): Promise<OperationalSignalRecord | undefined> {
  return db<OperationalSignalRecord>(SIGNALS)
    .where({
      organisation_id: organisationId,
      type,
      entity_type: entityType,
      entity_id: entityId,
    })
    .first();
}

/** Every currently-active signal for an organisation, most recently detected first. */
export function listActiveSignals(
  organisationId: number,
): Promise<OperationalSignalRecord[]> {
  return db<OperationalSignalRecord>(SIGNALS)
    .where({ organisation_id: organisationId, status: "active" })
    .orderBy("detected_at", "desc");
}

/** Every signal (active and resolved) for an organisation — Overview's counts by type. */
export function listAllSignals(
  organisationId: number,
): Promise<OperationalSignalRecord[]> {
  return db<OperationalSignalRecord>(SIGNALS)
    .where({ organisation_id: organisationId })
    .orderBy("detected_at", "desc");
}

export async function insertSignal(input: {
  organisationId: number;
  type: string;
  entityType: string;
  entityId: number;
  severity: string;
  message: string;
}): Promise<OperationalSignalRecord> {
  const [row] = await db<OperationalSignalRecord>(SIGNALS)
    .insert({
      organisation_id: input.organisationId,
      type: input.type,
      entity_type: input.entityType,
      entity_id: input.entityId,
      severity: input.severity,
      message: input.message,
      status: "active",
    })
    .returning("*");

  if (!row) {
    throw new Error("The signal row was not returned after insert.");
  }

  return row;
}

/** Refreshes an active signal's wording/severity in place — never touches detected_at, never re-notifies. */
export async function updateSignalFields(
  id: number,
  patch: { severity: string; message: string },
): Promise<OperationalSignalRecord> {
  const [row] = await db<OperationalSignalRecord>(SIGNALS)
    .where({ id })
    .update({ ...patch, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Signal ${id} disappeared during update.`);
  }

  return row;
}

/** The scan itself clearing a condition it no longer detects. */
export async function markSignalAutoResolved(
  id: number,
): Promise<OperationalSignalRecord> {
  const [row] = await db<OperationalSignalRecord>(SIGNALS)
    .where({ id })
    .update({
      status: "resolved",
      resolved_at: now(),
      resolved_by: null,
      resolution: "condition_cleared",
      updated_at: now(),
    })
    .returning("*");

  if (!row) {
    throw new Error(`Signal ${id} disappeared while auto-resolving.`);
  }

  return row;
}

/** A person explicitly acknowledging a signal. Idempotent: resolving twice is a no-op the caller can detect via the returned status. */
export async function markSignalResolvedManually(
  id: number,
  resolvedBy: number,
): Promise<OperationalSignalRecord> {
  const [row] = await db<OperationalSignalRecord>(SIGNALS)
    .where({ id, status: "active" })
    .update({
      status: "resolved",
      resolved_at: now(),
      resolved_by: resolvedBy,
      resolution: "manual",
      updated_at: now(),
    })
    .returning("*");

  if (row) {
    return row;
  }

  const existing = await findSignalById(id);

  if (!existing) {
    throw new Error(`Signal ${id} disappeared while resolving.`);
  }

  return existing;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add node/src/intelligence/intelligence.repository.ts
git commit -m "feat(phase6): add operational signal repository"
```

---

## Task 4 — `intelligence.signal.service.ts`: the detection engine, Attention read, and resolve

This is the one place all detectors run. It reuses `computeAndSync` (Work stalled/overdue), `computeAndSyncExpiry` (contract expiry), and `computeProjectHealth` (project/outcome) — no rule here is re-derived from scratch.

**Files:**
- Create: `node/src/intelligence/intelligence.signal.service.ts`

**Interfaces:**
- Consumes: `computeAndSync` (work.stalled.service.ts, Task 2), `computeAndSyncExpiry` (employment.expiry.service.ts, Task 2), `computeProjectHealth`, `APPROACHING_TARGET_DAYS`, `INACTIVE_PROJECT_DAYS` (project.health.service.ts, Task 2), `listOpenWorkItemsForOrganisation` (work.repository.ts), `listProjects`, `listOutcomesForProject` (project.repository.ts), `BLOCKED_REASON_LABELS` (obligation.types.ts), `requireOccupancyCapability` (organisation.service.ts), `findSignalByIdentity`/`insertSignal`/`updateSignalFields`/`markSignalAutoResolved`/`markSignalResolvedManually`/`findSignalById`/`listActiveSignals` (Task 3).
- Produces: `IntelligenceError` (re-exported by every other Task-5..8 service file, mirroring `HierarchyError`'s reuse pattern), `scanOrganisationSignals(organisationId)` (internal, used by Task 5's Overview too), `getAttention(userId, organisationId)`, `runAttentionScan(userId, organisationId)`, `resolveAttentionSignal(userId, organisationId, signalId)`, `PublicAttentionItem` type.

- [ ] **Step 1: Write the service**

```ts
// node/src/intelligence/intelligence.signal.service.ts
import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { BLOCKED_REASON_LABELS, type BlockedReason } from "../work/obligation.types.js";
import { listOpenWorkItemsForOrganisation } from "../work/work.repository.js";
import { computeAndSync } from "../work/work.stalled.service.js";
import {
  computeProjectHealth,
  APPROACHING_TARGET_DAYS,
  INACTIVE_PROJECT_DAYS,
} from "../projects/project.health.service.js";
import { listOutcomesForProject, listProjects } from "../projects/project.repository.js";
import { computeAndSyncExpiry } from "../employment/employment.expiry.service.js";
import type { OperationalSignalRecord, SignalSeverity, SignalType } from "./intelligence.record.js";
import {
  findSignalById,
  findSignalByIdentity,
  insertSignal,
  listActiveSignals,
  markSignalAutoResolved,
  markSignalResolvedManually,
  updateSignalFields,
} from "./intelligence.repository.js";

/** Carries field-scoped messages, the same contract every other module's error class uses. */
export class IntelligenceError extends Error {
  status: number;
  errors: { field: string; message: string }[];

  constructor(status: number, errors: { field: string; message: string }[]) {
    super(errors[0]?.message ?? "Request failed.");
    this.status = status;
    this.errors = errors;
  }

  static field(status: number, field: string, message: string): IntelligenceError {
    return new IntelligenceError(status, [{ field, message }]);
  }
}

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

function publicSignal(record: OperationalSignalRecord) {
  return {
    id: record.id,
    organisationId: record.organisation_id,
    type: record.type,
    entityType: record.entity_type,
    entityId: record.entity_id,
    status: record.status,
    severity: record.severity,
    message: record.message,
    detectedAt: record.detected_at,
    resolvedAt: record.resolved_at,
    resolvedBy: record.resolved_by,
    resolution: record.resolution,
    actionUrl: actionUrlFor(record),
  };
}

/** Where clicking an Attention item should take the reader — computed on read, never stored. */
function actionUrlFor(record: OperationalSignalRecord): string | null {
  if (record.entity_type === "work_item") {
    return `/work/${record.entity_id}`;
  }

  if (record.entity_type === "project") {
    return `/projects/${record.organisation_id}/${record.entity_id}`;
  }

  // project_outcome and contract have no standalone page — the organisation
  // screen (People/Projects panels) is where each is actually managed.
  return `/organisation/${record.organisation_id}`;
}

export type PublicAttentionItem = ReturnType<typeof publicSignal>;

/* ------------------------------------------------------------------------
   Sync — one signal's detected condition against its stored row.
   --------------------------------------------------------------------- */

/**
 * Idempotent by design: an already-active signal is only touched (message/
 * severity refreshed, detected_at untouched — never re-notified, mirroring
 * work_stall_notices). An already-*resolved* signal is left alone even if the
 * condition is still true — see the module doc comment on why resolution is
 * sticky. Returns the identity key so the caller can track what is still
 * being detected this scan.
 */
async function syncSignal(
  organisationId: number,
  type: SignalType,
  entityType: string,
  entityId: number,
  severity: SignalSeverity,
  message: string,
): Promise<string> {
  const key = `${type}:${entityType}:${entityId}`;
  const existing = await findSignalByIdentity(organisationId, type, entityType, entityId);

  if (!existing) {
    await insertSignal({ organisationId, type, entityType, entityId, severity, message });
    return key;
  }

  if (existing.status === "active") {
    await updateSignalFields(existing.id, { severity, message });
  }

  // status === "resolved": sticky. A person who resolved this already saw
  // and acted on it; the next scan does not silently reopen it. If the
  // underlying condition later genuinely changes (e.g. a fresh due date), a
  // future addition can compare a fingerprint of the condition rather than
  // just its (type, entity) identity — out of scope for Phase 6.
  return key;
}

/* ------------------------------------------------------------------------
   The scan — one pass over every detector, reusing existing logic.
   --------------------------------------------------------------------- */

export async function scanOrganisationSignals(organisationId: number): Promise<void> {
  const seenKeys = new Set<string>();

  /* ---- Work: overdue + stalled, via the exact same classification the
     stalled-work scan already uses (and already notifies from). */
  const diagnostics = await computeAndSync(organisationId);

  for (const diagnostic of diagnostics) {
    const type: SignalType = diagnostic.kind === "overdue" ? "work.overdue" : "work.stalled";
    const severity: SignalSeverity =
      diagnostic.kind === "stalled_blocked" || diagnostic.inactivityDays > 7 ? "high" : "normal";

    const key = await syncSignal(
      organisationId,
      type,
      "work_item",
      diagnostic.workItem.id,
      severity,
      `"${diagnostic.workItem.title}": ${diagnostic.message}`,
    );
    seenKeys.add(key);
  }

  /* ---- Work: blocked right now, independent of how long it has been. */
  const openWork = await listOpenWorkItemsForOrganisation(organisationId);

  for (const item of openWork) {
    if (item.status !== "blocked") {
      continue;
    }

    const reasonLabel = item.blocked_reason
      ? (BLOCKED_REASON_LABELS[item.blocked_reason as BlockedReason] ?? item.blocked_reason)
      : "an unspecified reason";

    const key = await syncSignal(
      organisationId,
      "work.blocked",
      "work_item",
      item.id,
      "normal",
      `"${item.title}" is blocked — ${reasonLabel}.`,
    );
    seenKeys.add(key);
  }

  /* ---- Projects + outcomes, via the exact same health computation the
     Project detail page already shows. */
  const projects = await listProjects(organisationId);

  for (const project of projects) {
    if (project.archived_at !== null) {
      continue;
    }

    const outcomes = await listOutcomesForProject(project.id);
    const health = await computeProjectHealth(project, outcomes);

    if (
      project.status === "active" &&
      health.daysSinceLastActivity !== null &&
      health.daysSinceLastActivity >= INACTIVE_PROJECT_DAYS
    ) {
      const key = await syncSignal(
        organisationId,
        "project.inactive",
        "project",
        project.id,
        "normal",
        `"${project.name}" has had no recorded activity for ${health.daysSinceLastActivity} days.`,
      );
      seenKeys.add(key);
    }

    if (health.approachingTargetDate) {
      const key = await syncSignal(
        organisationId,
        "project.target_approaching",
        "project",
        project.id,
        "normal",
        `"${project.name}"'s target date is within ${APPROACHING_TARGET_DAYS} days.`,
      );
      seenKeys.add(key);
    }

    const now = Date.now();

    for (const outcome of outcomes) {
      if (
        outcome.status !== "done" &&
        outcome.target_date !== null &&
        new Date(outcome.target_date).getTime() < now
      ) {
        const key = await syncSignal(
          organisationId,
          "outcome.overdue",
          "project_outcome",
          outcome.id,
          "normal",
          `"${outcome.title}" (in "${project.name}") is past its target date.`,
        );
        seenKeys.add(key);
      }
    }
  }

  /* ---- Contracts, via the exact same expiry computation that already
     writes contract_expiry_notices and notifies admins. */
  const expiring = await computeAndSyncExpiry(organisationId);

  for (const entry of expiring) {
    const key = await syncSignal(
      organisationId,
      "contract.expiring",
      "contract",
      entry.contract.id,
      entry.daysUntilExpiry < 0 ? "high" : "normal",
      entry.daysUntilExpiry >= 0
        ? `${entry.memberName}'s ${entry.contract.contractTypeLabel} contract ends in ${entry.daysUntilExpiry} day(s).`
        : `${entry.memberName}'s ${entry.contract.contractTypeLabel} contract ended ${Math.abs(entry.daysUntilExpiry)} day(s) ago and needs review.`,
    );
    seenKeys.add(key);
  }

  /* ---- Anything still active but no longer detected this pass is cleared. */
  const active = await listActiveSignals(organisationId);

  for (const row of active) {
    const key = `${row.type}:${row.entity_type}:${row.entity_id}`;

    if (!seenKeys.has(key)) {
      await markSignalAutoResolved(row.id);
    }
  }
}

/* ------------------------------------------------------------------------
   Authorized entry points
   --------------------------------------------------------------------- */

export async function getAttention(userId: number, organisationId: number) {
  await requireOccupancyCapability(userId, organisationId);

  await scanOrganisationSignals(organisationId);

  const active = await listActiveSignals(organisationId);

  return { attention: active.map(publicSignal) };
}

export async function runAttentionScan(userId: number, organisationId: number) {
  await requireOccupancyCapability(userId, organisationId);

  await scanOrganisationSignals(organisationId);

  const active = await listActiveSignals(organisationId);

  return {
    message:
      active.length === 0
        ? "Nothing needs attention right now."
        : `${active.length} item(s) need attention.`,
    attention: active.map(publicSignal),
  };
}

export async function resolveAttentionSignal(
  userId: number,
  organisationId: number,
  signalId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const existing = await findSignalById(signalId);

  if (!existing || existing.organisation_id !== organisationId) {
    throw IntelligenceError.field(404, "form", "That attention item could not be found.");
  }

  if (existing.status === "resolved") {
    return { message: "That item is already resolved.", attention: publicSignal(existing) };
  }

  const resolved = await markSignalResolvedManually(signalId, userId);

  return { message: "Marked resolved.", attention: publicSignal(resolved) };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add node/src/intelligence/intelligence.signal.service.ts
git commit -m "feat(phase6): add signal detection engine and Attention Center service"
```

---

## Task 5 — `intelligence.overview.service.ts`

**Files:**
- Create: `node/src/intelligence/intelligence.overview.service.ts`

**Interfaces:**
- Consumes: `IntelligenceError`, `scanOrganisationSignals` (Task 4), `listActiveSignals`, `listAllSignals` (Task 3), `listPositions` (hierarchy.repository.ts), `listActiveOccupancies` (occupancy.repository.ts), `listMembers` (organisation.repository.ts), `listWorkItemsForOrganisation` (work.repository.ts, Task 2), `classifyWorkItem` (work.stalled.service.ts), `ensureWorkSettings` (obligation.repository.ts), `listProjects` (project.repository.ts), `listOutcomesForOrganisation` (project.repository.ts, Task 2), `requireOccupancyCapability`.
- Produces: `getOrganisationOverview(userId, organisationId)`.

- [ ] **Step 1: Write the service**

```ts
// node/src/intelligence/intelligence.overview.service.ts
import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { listMembers } from "../organisation/organisation.repository.js";
import { listPositions } from "../hierarchy/hierarchy.repository.js";
import { listActiveOccupancies } from "../hierarchy/occupancy.repository.js";
import { ensureWorkSettings } from "../work/obligation.repository.js";
import { listWorkItemsForOrganisation } from "../work/work.repository.js";
import { classifyWorkItem } from "../work/work.stalled.service.js";
import { listOutcomesForOrganisation, listProjects } from "../projects/project.repository.js";
import { listActiveSignals, listAllSignals } from "./intelligence.repository.js";
import { scanOrganisationSignals } from "./intelligence.signal.service.js";
import { SIGNAL_TYPES, type SignalType } from "./intelligence.record.js";

const APPROACHING_OUTCOME_DAYS = 14;

function isOpenWork(status: string): boolean {
  return status !== "done" && status !== "cancelled";
}

export async function getOrganisationOverview(userId: number, organisationId: number) {
  await requireOccupancyCapability(userId, organisationId);

  await scanOrganisationSignals(organisationId);

  const [members, positions, occupancies, settings, workItems, projects, outcomes, activeSignals] =
    await Promise.all([
      listMembers(organisationId),
      listPositions(organisationId),
      listActiveOccupancies(organisationId),
      ensureWorkSettings(organisationId),
      listWorkItemsForOrganisation(organisationId),
      listProjects(organisationId),
      listOutcomesForOrganisation(organisationId),
      listActiveSignals(organisationId),
    ]);

  /* ---- People ---- */
  const activeMembers = members.filter((member) => member.status === "active");
  const occupiedPositionIds = new Set(occupancies.map((row) => row.position_id));

  const people = {
    activeMembers: activeMembers.length,
    occupiedPositions: occupiedPositionIds.size,
    vacantPositions: positions.length - occupiedPositionIds.size,
  };

  /* ---- Work ---- */
  const now = Date.now();
  let openWork = 0;
  let completedWork = 0;
  let overdueWork = 0;
  let blockedWork = 0;
  let stalledWork = 0;

  for (const item of workItems) {
    if (item.status === "done") {
      completedWork += 1;
    }

    if (isOpenWork(item.status)) {
      openWork += 1;

      if (item.status === "blocked") {
        blockedWork += 1;
      }

      if (item.due_at !== null && new Date(item.due_at).getTime() < now) {
        overdueWork += 1;
      }

      const kind = classifyWorkItem(item, settings, now);

      if (kind === "stalled_blocked" || kind === "stalled_inactive") {
        stalledWork += 1;
      }
    }
  }

  const work = { total: workItems.length, open: openWork, completed: completedWork, overdue: overdueWork, blocked: blockedWork, stalled: stalledWork };

  /* ---- Projects ---- */
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const pausedProjects = projects.filter((p) => p.status === "paused").length;
  const completedProjects = projects.filter((p) => p.status === "completed").length;

  const projectsWithSignal = new Set(
    activeSignals
      .filter((s) => s.entity_type === "project")
      .map((s) => s.entity_id),
  );

  // An outcome signal points at the outcome, not its parent project — the
  // signal row does not carry a project id. "Projects requiring attention"
  // therefore counts direct project.* signals only (a conservative,
  // easy-to-explain count) rather than tracing outcome signals back to a
  // parent project.
  const projectsSummary = {
    active: activeProjects,
    paused: pausedProjects,
    completed: completedProjects,
    requiringAttention: projectsWithSignal.size,
  };

  /* ---- Outcomes ---- */
  const outcomesTotal = outcomes.length;
  const outcomesCompleted = outcomes.filter((o) => o.status === "done").length;
  const outcomesOpen = outcomesTotal - outcomesCompleted;
  let outcomesOverdue = 0;
  let outcomesApproaching = 0;

  for (const outcome of outcomes) {
    if (outcome.status === "done" || outcome.target_date === null) {
      continue;
    }

    const targetMillis = new Date(outcome.target_date).getTime();

    if (targetMillis < now) {
      outcomesOverdue += 1;
    } else if (targetMillis - now <= APPROACHING_OUTCOME_DAYS * 86_400_000) {
      outcomesApproaching += 1;
    }
  }

  const outcomesSummary = {
    total: outcomesTotal,
    open: outcomesOpen,
    completed: outcomesCompleted,
    overdue: outcomesOverdue,
    approachingTarget: outcomesApproaching,
  };

  /* ---- Attention ---- */
  const allSignals = await listAllSignals(organisationId);
  const byType: Record<SignalType, number> = Object.fromEntries(
    SIGNAL_TYPES.map((type) => [type, 0]),
  ) as Record<SignalType, number>;

  for (const signal of allSignals) {
    if (signal.status === "active" && signal.type in byType) {
      byType[signal.type as SignalType] += 1;
    }
  }

  const attention = { active: activeSignals.length, byType };

  return { people, work, projects: projectsSummary, outcomes: outcomesSummary, attention };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add node/src/intelligence/intelligence.overview.service.ts
git commit -m "feat(phase6): add organisation overview service"
```

---

## Task 6 — `intelligence.activity.service.ts`

**Files:**
- Create: `node/src/intelligence/intelligence.activity.service.ts`

**Interfaces:**
- Consumes: `listMembers` (organisation.repository.ts), `listPositions` (hierarchy.repository.ts), `listOccupancyHistoryForOrganisation` (occupancy.repository.ts, Task 2), `listDepartmentSummaries` (department.repository.ts), `listWorkItemsForOrganisation`, `listReportsForOrganisation`, `listAttachmentsForOrganisation` (work.repository.ts, Task 2), `listProjectEventsForOrganisation` (project.repository.ts, Task 2), `listEmploymentRecordsForOrganisation`, `listContractsForOrganisation` (employment.repository.ts, Task 2), `contractTypeLabel` (employment.types.ts), `requireOccupancyCapability`.
- Produces: `getOrganisationActivity(userId, organisationId, limit?)`.

- [ ] **Step 1: Write the service**

```ts
// node/src/intelligence/intelligence.activity.service.ts
import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { listMembers } from "../organisation/organisation.repository.js";
import { listPositions } from "../hierarchy/hierarchy.repository.js";
import { listOccupancyHistoryForOrganisation } from "../hierarchy/occupancy.repository.js";
import { listDepartmentSummaries } from "../departments/department.repository.js";
import {
  listAttachmentsForOrganisation,
  listReportsForOrganisation,
  listWorkItemsForOrganisation,
} from "../work/work.repository.js";
import { listProjectEventsForOrganisation } from "../projects/project.repository.js";
import {
  listContractsForOrganisation,
  listEmploymentRecordsForOrganisation,
} from "../employment/employment.repository.js";
import { contractTypeLabel } from "../employment/employment.types.js";

type ActivityEntry = {
  id: string;
  type: string;
  message: string;
  occurredAt: string;
};

function memberDisplayName(
  member: { full_name?: string | null; profile_email?: string | null; email?: string | null; title?: string | null } | undefined,
): string {
  return member?.full_name ?? member?.profile_email ?? member?.email ?? member?.title ?? "Someone";
}

export async function getOrganisationActivity(
  userId: number,
  organisationId: number,
  limit = 100,
) {
  await requireOccupancyCapability(userId, organisationId);

  const [
    members,
    positions,
    occupancyHistory,
    departments,
    workItems,
    reports,
    attachments,
    projectEvents,
    employmentRecords,
    contracts,
  ] = await Promise.all([
    listMembers(organisationId),
    listPositions(organisationId),
    listOccupancyHistoryForOrganisation(organisationId),
    listDepartmentSummaries(organisationId),
    listWorkItemsForOrganisation(organisationId),
    listReportsForOrganisation(organisationId),
    listAttachmentsForOrganisation(organisationId),
    listProjectEventsForOrganisation(organisationId, 200),
    listEmploymentRecordsForOrganisation(organisationId),
    listContractsForOrganisation(organisationId),
  ]);

  const membersById = new Map(members.map((m) => [m.id, m]));
  const positionsById = new Map(positions.map((p) => [p.id, p]));
  const workItemsById = new Map(workItems.map((w) => [w.id, w]));
  const employmentById = new Map(employmentRecords.map((e) => [e.id, e]));

  const entries: ActivityEntry[] = [];

  for (const member of members) {
    const name = memberDisplayName(member);

    if (member.joined_at) {
      entries.push({
        id: `member-joined-${member.id}`,
        type: "member.joined",
        message: `${name} joined the organisation.`,
        occurredAt: member.joined_at,
      });
    }

    if (member.left_at) {
      entries.push({
        id: `member-left-${member.id}`,
        type: "member.concluded",
        message: `${name}'s membership concluded.`,
        occurredAt: member.left_at,
      });
    }
  }

  for (const row of occupancyHistory) {
    const memberName = memberDisplayName(membersById.get(row.member_id));
    const positionName = positionsById.get(row.position_id)?.name ?? `Position #${row.position_id}`;

    entries.push({
      id: `occupancy-start-${row.id}`,
      type: "occupancy.started",
      message: `${memberName} was placed in ${positionName}.`,
      occurredAt: row.starts_at,
    });

    if (row.ends_at) {
      entries.push({
        id: `occupancy-end-${row.id}`,
        type: "occupancy.ended",
        message: `${memberName}'s placement in ${positionName} ended.`,
        occurredAt: row.ends_at,
      });
    }
  }

  for (const department of departments) {
    entries.push({
      id: `department-${department.id}`,
      type: "department.created",
      message: `Department "${department.name}" was created.`,
      occurredAt: department.created_at,
    });
  }

  for (const position of positions) {
    entries.push({
      id: `position-${position.id}`,
      type: "position.created",
      message: `Position "${position.name}" was created.`,
      occurredAt: position.created_at,
    });
  }

  for (const item of workItems) {
    entries.push({
      id: `work-created-${item.id}`,
      type: "work.created",
      message: `Work "${item.title}" was created.`,
      occurredAt: item.created_at,
    });
  }

  for (const report of reports) {
    const workTitle = workItemsById.get(report.work_item_id)?.title ?? "a work item";

    if (report.submitted_at) {
      entries.push({
        id: `report-submitted-${report.id}`,
        type: "work.report_submitted",
        message: `A report was submitted for "${workTitle}".`,
        occurredAt: report.submitted_at,
      });
    }

    if (report.state === "accepted" && report.reviewed_at) {
      entries.push({
        id: `report-accepted-${report.id}`,
        type: "work.completed",
        message: `"${workTitle}" was completed.`,
        occurredAt: report.reviewed_at,
      });
    }

    if (report.state === "returned" && report.reviewed_at) {
      entries.push({
        id: `report-returned-${report.id}`,
        type: "work.report_returned",
        message: `A report for "${workTitle}" was sent back for revision.`,
        occurredAt: report.reviewed_at,
      });
    }
  }

  for (const attachment of attachments) {
    const workTitle = workItemsById.get(attachment.work_item_id)?.title ?? "a work item";

    entries.push({
      id: `evidence-${attachment.id}`,
      type: "work.evidence_recorded",
      message: `Evidence was attached to a report on "${workTitle}".`,
      occurredAt: attachment.created_at,
    });
  }

  for (const event of projectEvents) {
    entries.push({
      id: `project-event-${event.id}`,
      type: `project.${event.type}`,
      message: event.message,
      occurredAt: event.created_at,
    });
  }

  for (const record of employmentRecords) {
    const memberName = memberDisplayName(membersById.get(record.member_id));

    entries.push({
      id: `employment-${record.id}`,
      type: "employment.created",
      message: `An employment record was created for ${memberName}.`,
      occurredAt: record.created_at,
    });
  }

  for (const contract of contracts) {
    const employmentRecord = employmentById.get(contract.employment_record_id);
    const memberName = employmentRecord
      ? memberDisplayName(membersById.get(employmentRecord.member_id))
      : "a member";

    entries.push({
      id: `contract-${contract.id}`,
      type: "employment.contract_created",
      message: `A ${contractTypeLabel(contract.contract_type)} contract was created for ${memberName}.`,
      occurredAt: contract.created_at,
    });
  }

  entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return { activity: entries.slice(0, limit) };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors. (If `member.title` or similar fields do not exist on the `OrganisationMemberWithProfile` type used by `listMembers`, adjust `memberDisplayName`'s field list to match what `organisation.record.ts` actually exports — re-check that type before finalizing this file.)

- [ ] **Step 3: Commit**

```bash
git add node/src/intelligence/intelligence.activity.service.ts
git commit -m "feat(phase6): add organisation activity feed service"
```

---

## Task 7 — `intelligence.search.service.ts`

**Files:**
- Create: `node/src/intelligence/intelligence.search.service.ts`

**Interfaces:**
- Consumes: `listMembers`, `listPositions`, `listDepartmentSummaries`, `listWorkItemsForOrganisation`, `listProjects`, `listOutcomesForOrganisation`, `publicProject`/`publicOutcome` (Task 2), `publicWorkItem`, `requireOccupancyCapability`.
- Produces: `searchOrganisation(userId, organisationId, query)`.

- [ ] **Step 1: Write the service**

```ts
// node/src/intelligence/intelligence.search.service.ts
import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { listMembers } from "../organisation/organisation.repository.js";
import { listPositions } from "../hierarchy/hierarchy.repository.js";
import { listDepartmentSummaries } from "../departments/department.repository.js";
import { listWorkItemsForOrganisation } from "../work/work.repository.js";
import { listOutcomesForOrganisation, listProjects } from "../projects/project.repository.js";

const MAX_RESULTS_PER_CATEGORY = 8;
const MIN_QUERY_LENGTH = 2;

type SearchResult = {
  type: "person" | "position" | "department" | "work" | "project" | "outcome";
  id: number;
  title: string;
  subtitle: string;
  url: string;
};

function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  return fields.some((field) => field?.toLowerCase().includes(query));
}

export async function searchOrganisation(userId: number, organisationId: number, rawQuery: unknown) {
  await requireOccupancyCapability(userId, organisationId);

  const query = typeof rawQuery === "string" ? rawQuery.trim().toLowerCase() : "";

  const empty = { people: [], positions: [], departments: [], work: [], projects: [], outcomes: [] };

  if (query.length < MIN_QUERY_LENGTH) {
    return { query, results: empty as Record<keyof typeof empty, SearchResult[]> };
  }

  const [members, positions, departments, workItems, projects, outcomes] = await Promise.all([
    listMembers(organisationId),
    listPositions(organisationId),
    listDepartmentSummaries(organisationId),
    listWorkItemsForOrganisation(organisationId),
    listProjects(organisationId),
    listOutcomesForOrganisation(organisationId),
  ]);

  const projectsById = new Map(projects.map((p) => [p.id, p]));

  const people: SearchResult[] = members
    .filter((m) => matches(query, m.full_name, m.username, m.profile_email, m.title))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((m) => ({
      type: "person" as const,
      id: m.id,
      title: m.full_name ?? m.profile_email ?? `Member #${m.id}`,
      subtitle: m.title ?? m.organisation_class,
      url: `/organisation/${organisationId}`,
    }));

  const positionResults: SearchResult[] = positions
    .filter((p) => matches(query, p.name))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((p) => ({
      type: "position" as const,
      id: p.id,
      title: p.name,
      subtitle: "Position",
      url: `/organisation/${organisationId}/hierarchy`,
    }));

  const departmentResults: SearchResult[] = departments
    .filter((d) => matches(query, d.name))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((d) => ({
      type: "department" as const,
      id: d.id,
      title: d.name,
      subtitle: "Department",
      url: `/organisation/${organisationId}/hierarchy`,
    }));

  const workResults: SearchResult[] = workItems
    .filter((w) => matches(query, w.title, w.description))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((w) => ({
      type: "work" as const,
      id: w.id,
      title: w.title,
      subtitle: w.status,
      url: `/work/${w.id}`,
    }));

  const projectResults: SearchResult[] = projects
    .filter((p) => matches(query, p.name, p.description))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((p) => ({
      type: "project" as const,
      id: p.id,
      title: p.name,
      subtitle: p.status,
      url: `/projects/${organisationId}/${p.id}`,
    }));

  const outcomeResults: SearchResult[] = outcomes
    .filter((o) => matches(query, o.title, o.description))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((o) => ({
      type: "outcome" as const,
      id: o.id,
      title: o.title,
      subtitle: projectsById.get(o.project_id)?.name ?? o.status,
      url: `/projects/${organisationId}/${o.project_id}`,
    }));

  return {
    query,
    results: {
      people,
      positions: positionResults,
      departments: departmentResults,
      work: workResults,
      projects: projectResults,
      outcomes: outcomeResults,
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors. (If `OrganisationMemberWithProfile` does not carry `organisation_class` as a plain field name — it does, per `organisation.record.ts` — this compiles as-is; verify against that file if the compiler disagrees.)

- [ ] **Step 3: Commit**

```bash
git add node/src/intelligence/intelligence.search.service.ts
git commit -m "feat(phase6): add organisation search service"
```

---

## Task 8 — `intelligence.history.service.ts`: Person Operational History

**Files:**
- Create: `node/src/intelligence/intelligence.history.service.ts`

**Interfaces:**
- Consumes: `IntelligenceError` (Task 4), `findMembershipById` (organisation.repository.ts), `publicMembership` (organisation.service.ts, Task 2), `listPositions` (hierarchy.repository.ts), `listOccupancyHistoryByMember` (occupancy.repository.ts), `listDepartmentsForMember` (department.repository.ts), `listEmploymentHistoryByMember` (employment.repository.ts), `listContractsByEmploymentRecord` (employment.repository.ts), `publicEmploymentRecord`/`publicContract` (employment.service.ts), `listVisibleWorkItems` (work.repository.ts), `publicWorkItem` (work.service.ts), `listReportsForOrganisation`, `listAttachmentsForOrganisation` (work.repository.ts, Task 2), `listProjects`, `listProjectMembershipsForProfile`, `listOutcomesForOrganisation` (project.repository.ts, Task 2), `publicProject`/`publicOutcome` (project.service.ts, Task 2), `requireOccupancyCapability`.
- Produces: `getMemberOperationalHistory(userId, organisationId, memberId)`.

- [ ] **Step 1: Write the service**

```ts
// node/src/intelligence/intelligence.history.service.ts
import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { findMembershipById } from "../organisation/organisation.repository.js";
import { publicMembership } from "../organisation/organisation.service.js";
import { listPositions } from "../hierarchy/hierarchy.repository.js";
import { listOccupancyHistoryByMember } from "../hierarchy/occupancy.repository.js";
import { listDepartmentsForMember } from "../departments/department.repository.js";
import {
  listContractsByEmploymentRecord,
  listEmploymentHistoryByMember,
} from "../employment/employment.repository.js";
import { publicContract, publicEmploymentRecord } from "../employment/employment.service.js";
import {
  listAttachmentsForOrganisation,
  listReportsForOrganisation,
  listVisibleWorkItems,
} from "../work/work.repository.js";
import { publicWorkItem } from "../work/work.service.js";
import {
  listOutcomesForOrganisation,
  listProjectMembershipsForProfile,
  listProjects,
} from "../projects/project.repository.js";
import { publicOutcome, publicProject } from "../projects/project.service.js";
import { IntelligenceError } from "./intelligence.signal.service.js";

export async function getMemberOperationalHistory(
  userId: number,
  organisationId: number,
  memberId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const member = await findMembershipById(organisationId, memberId);

  if (!member) {
    throw IntelligenceError.field(404, "form", "That person could not be found.");
  }

  const profileId = member.profile_id;

  const [occupancyHistory, departments, employmentHistory, positions] = await Promise.all([
    listOccupancyHistoryByMember(organisationId, member.id),
    listDepartmentsForMember(member.id),
    listEmploymentHistoryByMember(member.id),
    listPositions(organisationId),
  ]);

  const positionsById = new Map(positions.map((p) => [p.id, p]));

  const employment = await Promise.all(
    employmentHistory.map(async (record) => ({
      employmentRecord: publicEmploymentRecord(record),
      contracts: (await listContractsByEmploymentRecord(record.id)).map(publicContract),
    })),
  );

  let workItems: ReturnType<typeof publicWorkItem>[] = [];
  let reports: { id: number; workItemId: number; state: string; submittedAt: string | null; reviewedAt: string | null }[] = [];
  let evidence: { id: number; workItemId: number; fileName: string; createdAt: string }[] = [];
  let projects: ReturnType<typeof publicProject>[] = [];
  let outcomesOwned: ReturnType<typeof publicOutcome>[] = [];

  if (profileId !== null) {
    const visible = await listVisibleWorkItems(profileId);
    workItems = visible
      .filter((item) => item.organisation_id === organisationId)
      .map(publicWorkItem);

    const allReports = await listReportsForOrganisation(organisationId);
    reports = allReports
      .filter((r) => r.author_profile_id === profileId)
      .map((r) => ({
        id: r.id,
        workItemId: r.work_item_id,
        state: r.state,
        submittedAt: r.submitted_at,
        reviewedAt: r.reviewed_at,
      }));

    const allAttachments = await listAttachmentsForOrganisation(organisationId);
    evidence = allAttachments
      .filter((a) => a.uploaded_by_profile_id === profileId)
      .map((a) => ({
        id: a.id,
        workItemId: a.work_item_id,
        fileName: a.file_name,
        createdAt: a.created_at,
      }));

    const [owned, memberOf, allOutcomes] = await Promise.all([
      listProjects(organisationId),
      listProjectMembershipsForProfile(organisationId, profileId),
      listOutcomesForOrganisation(organisationId),
    ]);

    const projectMap = new Map(
      [...owned.filter((p) => p.owner_profile_id === profileId), ...memberOf].map((p) => [p.id, p]),
    );
    projects = [...projectMap.values()].map(publicProject);

    outcomesOwned = allOutcomes
      .filter((o) => o.owner_profile_id === profileId)
      .map(publicOutcome);
  }

  return {
    memberId: member.id,
    profileId,
    membership: publicMembership(member),
    structure: {
      positions: occupancyHistory.map((row) => ({
        positionId: row.position_id,
        positionName: positionsById.get(row.position_id)?.name ?? null,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        isActive: row.ends_at === null,
      })),
      departments: departments.map((d) => ({ id: d.id, name: d.name })),
    },
    employment,
    work: { items: workItems, reports, evidence },
    projects: { memberships: projects, outcomesOwned },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors. Fix any field-name mismatches against the actual exported types before moving on — this file touches more existing types than any other in this phase.

- [ ] **Step 3: Commit**

```bash
git add node/src/intelligence/intelligence.history.service.ts
git commit -m "feat(phase6): add person operational history service"
```

---

## Task 9 — `intelligence.controller.ts` + `intelligence.routes.ts` + mount

**Files:**
- Create: `node/src/intelligence/intelligence.controller.ts`
- Create: `node/src/intelligence/intelligence.routes.ts`
- Modify: `node/src/app.ts`

**Interfaces:**
- Consumes: every `get*`/`run*`/`resolve*`/`search*` function from Tasks 4–8, `IntelligenceError`, `currentUserId`.
- Produces: `GET /api/intelligence/:organisationId/overview`, `GET /api/intelligence/:organisationId/attention`, `POST /api/intelligence/:organisationId/attention/scan`, `POST /api/intelligence/:organisationId/attention/:signalId/resolve`, `GET /api/intelligence/:organisationId/activity`, `GET /api/intelligence/:organisationId/search`, `GET /api/intelligence/:organisationId/members/:memberId/history`.

- [ ] **Step 1: Write the controller**

```ts
// node/src/intelligence/intelligence.controller.ts
import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import { OrganisationError } from "../organisation/organisation.service.js";
import { getOrganisationOverview } from "./intelligence.overview.service.js";
import {
  IntelligenceError,
  getAttention,
  resolveAttentionSignal,
  runAttentionScan,
} from "./intelligence.signal.service.js";
import { getOrganisationActivity } from "./intelligence.activity.service.js";
import { searchOrganisation } from "./intelligence.search.service.js";
import { getMemberOperationalHistory } from "./intelligence.history.service.js";

function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof IntelligenceError || error instanceof OrganisationError) {
    res.status(error.status).json({ message: error.message, errors: error.errors });
    return;
  }

  console.error(`${context}:`, error);
  res.status(500).json({ message: "Something went wrong. Please try again.", errors: [] });
}

function readId(raw: unknown, label: string): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw IntelligenceError.field(404, "form", `That ${label} could not be found.`);
  }

  return value;
}

export async function overview(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    res.status(200).json(await getOrganisationOverview(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to load overview");
  }
}

export async function attentionIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    res.status(200).json(await getAttention(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to load attention");
  }
}

export async function attentionScan(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    res.status(200).json(await runAttentionScan(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to run attention scan");
  }
}

export async function attentionResolve(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const signalId = readId(req.params.signalId, "attention item");
    res
      .status(200)
      .json(await resolveAttentionSignal(currentUserId(req), organisationId, signalId));
  } catch (error) {
    handleFailure(res, error, "Failed to resolve attention item");
  }
}

export async function activityIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    res.status(200).json(await getOrganisationActivity(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to load activity");
  }
}

export async function search(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    res
      .status(200)
      .json(await searchOrganisation(currentUserId(req), organisationId, req.query.q));
  } catch (error) {
    handleFailure(res, error, "Failed to search");
  }
}

export async function memberHistory(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const memberId = readId(req.params.memberId, "member");
    res
      .status(200)
      .json(await getMemberOperationalHistory(currentUserId(req), organisationId, memberId));
  } catch (error) {
    handleFailure(res, error, "Failed to load member history");
  }
}
```

- [ ] **Step 2: Write the routes**

```ts
// node/src/intelligence/intelligence.routes.ts
import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  activityIndex,
  attentionIndex,
  attentionResolve,
  attentionScan,
  memberHistory,
  overview,
  search,
} from "./intelligence.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

router.get("/:organisationId/overview", overview);

router.get("/:organisationId/attention", attentionIndex);
router.post("/:organisationId/attention/scan", attentionScan);
router.post("/:organisationId/attention/:signalId/resolve", attentionResolve);

router.get("/:organisationId/activity", activityIndex);
router.get("/:organisationId/search", search);

router.get("/:organisationId/members/:memberId/history", memberHistory);

export default router;
```

- [ ] **Step 3: Mount in `node/src/app.ts`**

Add the import (alongside the others, alphabetically among the local imports):
```ts
import hierarchyRoutes from "./hierarchy/hierarchy.routes.js";
import intelligenceRoutes from "./intelligence/intelligence.routes.js";
import notificationRoutes from "./notifications/notification.routes.js";
```

Add the mount (grouped with the other feature mounts, after employment):
```ts
app.use("/api/employment", employmentRoutes);
app.use("/api/intelligence", intelligenceRoutes);
app.use("/api/reference", referenceRoutes);
```

- [ ] **Step 4: Typecheck and boot**

Run: `cd node && npm run typecheck`
Expected: no errors.

Run: `cd node && npm run dev` (leave running in the background for Task 10)
Expected: `Yahzel API listening on port 5000` with no startup errors.

- [ ] **Step 5: Commit**

```bash
git add node/src/intelligence/intelligence.controller.ts node/src/intelligence/intelligence.routes.ts node/src/app.ts
git commit -m "feat(phase6): add intelligence controller, routes, and mount at /api/intelligence"
```

---

## Task 10 — Backend E2E check script + regression suite

**Files:**
- Create: `node/scripts/check-intelligence-phase6-api.ts`
- Modify: `node/package.json`

**Interfaces:**
- Consumes: the full `/api/intelligence/*` surface (Task 9), plus `/api/auth`, `/api/organisations`, `/api/work`, `/api/projects`, `/api/employment` to build fixtures — mirrors `check-projects-phase5-api.ts`'s structure exactly (same `call`/`json`/`makeUser`/`addActiveMember`/teardown helpers).

- [ ] **Step 1: Write the check script**

This follows `check-projects-phase5-api.ts`'s exact template (same helpers, same teardown discipline). Build the realistic Phase 6 scenario from spec section 17: an org, a project with an outcome, several work items (one overdue, one blocked, one stalled via a backdated `last_activity_at`, one completed), a member with a contract approaching expiry, then verify Attention/Overview/Activity/History/Search/isolation/resolve.

```ts
// node/scripts/check-intelligence-phase6-api.ts
import { db } from "../src/db/knex.js";

/**
 * End-to-end check of Phase 6 (Organizational Intelligence & Operational
 * Memory), in the style of check-projects-phase5-api.ts: drives the running
 * API over HTTP with throwaway accounts and organisations, and removes
 * everything it created.
 *
 * Start the API first:  npm run dev
 */

const API = process.env.CHECK_API_URL ?? "http://localhost:5000";
let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : `  -> ${JSON.stringify(detail)}`}`);
}

async function call(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, options);
  const body = await res.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: body as any };
}

function json(method: string, token: string | null, payload?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  };
}

async function makeUser(fullName: string, email: string) {
  const reg = await call("/api/auth/register", json("POST", null, { fullName, email, password: "password123", confirmPassword: "password123" }));
  const id = reg.body.user.id as number;
  const row = await db("profiles").where({ id }).first();
  const verified = await call("/api/auth/verify", json("POST", null, { userId: id, otp: row.verification_otp }));
  return { id, fullName, email, token: verified.body.token as string };
}

async function addActiveMember(organisationId: number, adminToken: string, person: { id: number; email: string; token: string }) {
  const invite = await call(`/api/organisations/${organisationId}/invitations`, json("POST", adminToken, { person: person.email }));
  const invitationId = invite.body.invitation?.id as number;
  await call(`/api/organisations/invitations/${invitationId}/accept`, json("POST", person.token));
}

const stamp = Date.now();

const founder = await makeUser("P6 Founder", `p6-founder${stamp}@example.com`);
const alice = await makeUser("P6 Alice", `p6-alice${stamp}@example.com`);
const bob = await makeUser("P6 Bob", `p6-bob${stamp}@example.com`);
const outsider = await makeUser("P6 Outsider", `p6-outsider${stamp}@example.com`);

let r = await call("/api/organisations", json("POST", founder.token, { name: `P6 Org A ${stamp}`, type: "company" }));
const orgA = r.body.organisation?.id as number;

r = await call("/api/organisations", json("POST", outsider.token, { name: `P6 Org B ${stamp}`, type: "company" }));
const orgB = r.body.organisation?.id as number;

await addActiveMember(orgA, founder.token, alice);
await addActiveMember(orgA, founder.token, bob);

const createdWorkIds: number[] = [];
const createdProjectIds: number[] = [];

/* ============================================================ AUTHORIZATION */

r = await call(`/api/intelligence/${orgA}/overview`, json("GET", alice.token));
check("a non-admin active member cannot read the overview", r.status === 403, r.body);

r = await call(`/api/intelligence/${orgA}/overview`, json("GET", outsider.token));
check("a non-member cannot read the overview (reads as not found)", r.status === 404, r.status);

r = await call(`/api/intelligence/${orgA}/attention`, json("GET", outsider.token));
check("a non-member cannot read attention", r.status === 404, r.status);

/* =========================================================== FIXTURE SETUP */

r = await call(`/api/projects/${orgA}`, json("POST", founder.token, { name: `Intel Project ${stamp}` }));
const project = r.body.project;
createdProjectIds.push(project.id);
await call(`/api/projects/${orgA}/${project.id}/status`, json("POST", founder.token, { status: "active" }));

r = await call(`/api/projects/${orgA}/${project.id}/outcomes`, json("POST", founder.token, {
  title: "Overdue outcome",
  targetDate: new Date(Date.now() - 5 * 86_400_000).toISOString(),
}));
const overdueOutcome = r.body.outcome;

r = await call("/api/work", json("POST", founder.token, {
  organisationId: orgA, title: `Overdue work ${stamp}`, assigneeProfileId: alice.id, projectId: project.id,
  dueAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
}));
const overdueWork = r.body.workItem.id as number;
createdWorkIds.push(overdueWork);

r = await call("/api/work", json("POST", founder.token, { organisationId: orgA, title: `Blocked work ${stamp}`, assigneeProfileId: bob.id, projectId: project.id }));
const blockedWork = r.body.workItem.id as number;
createdWorkIds.push(blockedWork);
await call(`/api/work/${blockedWork}`, json("PATCH", founder.token, { status: "blocked", blockedReason: "waiting_approval" }));

r = await call("/api/work", json("POST", founder.token, { organisationId: orgA, title: `Stalled work ${stamp}`, assigneeProfileId: alice.id, projectId: project.id }));
const stalledWork = r.body.workItem.id as number;
createdWorkIds.push(stalledWork);
await db("work_items").where({ id: stalledWork }).update({ last_activity_at: db.raw("now() - interval '20 days'") });

r = await call("/api/work", json("POST", founder.token, { organisationId: orgA, title: `Done work ${stamp}`, assigneeProfileId: alice.id, projectId: project.id }));
const doneWork = r.body.workItem.id as number;
createdWorkIds.push(doneWork);
await call(`/api/work/${doneWork}`, json("PATCH", founder.token, { status: "done", progress: 100 }));

// A member with an expiring contract, via the employment/contract flow.
r = await call(`/api/organisations/${orgA}/members`, json("GET", founder.token));
const aliceMembership = (r.body.members as { profileId: number | null; id: number }[]).find((m) => m.profileId === alice.id);
const aliceMemberId = aliceMembership!.id as number;

await call(`/api/employment/${orgA}/members/${aliceMemberId}`, json("POST", founder.token, {
  employmentStatus: "active",
  startDate: new Date(Date.now() - 200 * 86_400_000).toISOString(),
}));
r = await call(`/api/employment/${orgA}/members/${aliceMemberId}`, json("GET", founder.token));
const employmentRecordId = r.body.employmentRecord.id as number;

await call(`/api/employment/${orgA}/${employmentRecordId}/contracts`, json("POST", founder.token, {
  contractType: "fixed_term",
  startDate: new Date(Date.now() - 200 * 86_400_000).toISOString(),
  endDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
  status: "active",
}));

/* ================================================================ ATTENTION */

r = await call(`/api/intelligence/${orgA}/attention`, json("GET", founder.token));
check("the admin can read attention", r.status === 200, r.body);
const attentionTypes = (r.body.attention as { type: string }[]).map((a) => a.type);
check("work.overdue is detected", attentionTypes.includes("work.overdue"), attentionTypes);
check("work.blocked is detected", attentionTypes.includes("work.blocked"), attentionTypes);
check("work.stalled is detected", attentionTypes.includes("work.stalled"), attentionTypes);
check("outcome.overdue is detected", attentionTypes.includes("outcome.overdue"), attentionTypes);
check("contract.expiring is detected", attentionTypes.includes("contract.expiring"), attentionTypes);
check(
  "no performance score leaks into an attention item",
  r.body.attention.every((a: Record<string, unknown>) => !("score" in a) && !("rating" in a) && !("ranking" in a)),
  r.body.attention,
);

const overdueSignal = (r.body.attention as { id: number; type: string; entityId: number }[]).find(
  (a) => a.type === "work.overdue" && a.entityId === overdueWork,
);
check("the overdue-work signal references the right work item", Boolean(overdueSignal), r.body.attention);

/* --- idempotency: re-scanning does not duplicate or re-notify --- */
const beforeScanCount = r.body.attention.length as number;
r = await call(`/api/intelligence/${orgA}/attention/scan`, json("POST", founder.token));
check("scanning again is safe (POST /scan succeeds)", r.status === 200, r.body);
r = await call(`/api/intelligence/${orgA}/attention`, json("GET", founder.token));
check("re-scanning does not duplicate active signals", r.body.attention.length === beforeScanCount, {
  before: beforeScanCount,
  after: r.body.attention.length,
});

/* --- resolve: manual resolution removes it from the active list and stays gone --- */
r = await call(`/api/intelligence/${orgA}/attention/${overdueSignal!.id}/resolve`, json("POST", founder.token));
check("the admin can resolve an attention item", r.status === 200 && r.body.attention?.status === "resolved", r.body);

r = await call(`/api/intelligence/${orgA}/attention`, json("GET", founder.token));
const typesAfterResolve = (r.body.attention as { id: number }[]).map((a) => a.id);
check("a resolved item no longer appears as active", !typesAfterResolve.includes(overdueSignal!.id), typesAfterResolve);

// Re-scan again: the still-true condition must NOT reopen a manually resolved signal (sticky resolution).
await call(`/api/intelligence/${orgA}/attention/scan`, json("POST", founder.token));
r = await call(`/api/intelligence/${orgA}/attention`, json("GET", founder.token));
const stillGone = !(r.body.attention as { id: number }[]).map((a) => a.id).includes(overdueSignal!.id);
check("resolution is sticky across a later scan of the same still-true condition", stillGone, r.body.attention);

/* ================================================================= OVERVIEW */

r = await call(`/api/intelligence/${orgA}/overview`, json("GET", founder.token));
check("overview loads", r.status === 200, r.body);
check("overview counts active people", r.body.people?.activeMembers >= 3, r.body.people);
check("overview counts work totals", r.body.work?.total >= 4 && r.body.work?.completed >= 1, r.body.work);
check("overview reports blocked/overdue/stalled work", r.body.work?.blocked >= 1 && r.body.work?.stalled >= 1, r.body.work);
check("overview counts outcomes", r.body.outcomes?.total >= 1 && r.body.outcomes?.overdue >= 1, r.body.outcomes);
check("overview attention byType is present, not a score", typeof r.body.attention?.byType === "object", r.body.attention);
check(
  "overview never introduces a productivity/ranking field",
  !("productivity" in r.body) && !("ranking" in r.body) && !("leaderboard" in r.body),
  Object.keys(r.body),
);

/* ================================================================= ACTIVITY */

r = await call(`/api/intelligence/${orgA}/activity`, json("GET", founder.token));
check("activity loads", r.status === 200 && Array.isArray(r.body.activity), r.body);
const activityTypes = (r.body.activity as { type: string }[]).map((a) => a.type);
check("activity includes a member joining", activityTypes.includes("member.joined"), activityTypes);
check("activity includes work creation", activityTypes.includes("work.created"), activityTypes);
check("activity includes a project event", activityTypes.some((t) => t.startsWith("project.")), activityTypes);

const occurredTimes = (r.body.activity as { occurredAt: string }[]).map((a) => new Date(a.occurredAt).getTime());
const sorted = [...occurredTimes].sort((a, b) => b - a);
check("activity is ordered newest first", JSON.stringify(occurredTimes) === JSON.stringify(sorted), occurredTimes.slice(0, 5));

/* =============================================================== PERSON HISTORY */

r = await call(`/api/intelligence/${orgA}/members/${aliceMemberId}/history`, json("GET", founder.token));
check("member history loads", r.status === 200, r.body);
check("member history includes the membership record", r.body.membership?.id === aliceMemberId, r.body.membership);
check("member history includes employment/contract history", r.body.employment?.length >= 1 && r.body.employment[0].contracts.length >= 1, r.body.employment);
check(
  "member history includes work items alice is connected to",
  (r.body.work?.items as { id: number }[]).some((w) => [overdueWork, stalledWork, doneWork].includes(w.id)),
  r.body.work,
);
check(
  "member history never invents a skills or rating field",
  !("skills" in r.body) && !("rating" in r.body) && !("performanceScore" in r.body),
  Object.keys(r.body),
);

r = await call(`/api/intelligence/${orgA}/members/${aliceMemberId}/history`, json("GET", alice.token));
check("a non-admin member cannot read another person's operational history", r.status === 403, r.body);

r = await call(`/api/intelligence/${orgB}/members/${aliceMemberId}/history`, json("GET", outsider.token));
check("a member id from another organisation is not found there", r.status === 404 || r.status === 403, r.status);

/* =================================================================== SEARCH */

r = await call(`/api/intelligence/${orgA}/search?q=${encodeURIComponent("Overdue")}`, json("GET", founder.token));
check("search finds the overdue work item and outcome by title", r.status === 200, r.body);
const searchWorkTitles = (r.body.results?.work as { title: string }[]).map((w) => w.title);
const searchOutcomeTitles = (r.body.results?.outcomes as { title: string }[]).map((o) => o.title);
check("search results include the overdue work item", searchWorkTitles.some((t) => t.includes("Overdue work")), searchWorkTitles);
check("search results include the overdue outcome", searchOutcomeTitles.includes(overdueOutcome.title), searchOutcomeTitles);

r = await call(`/api/intelligence/${orgA}/search?q=a`, json("GET", founder.token));
check("a too-short query returns empty results rather than everything", Object.values(r.body.results ?? {}).every((v: unknown) => Array.isArray(v) && v.length === 0), r.body);

r = await call(`/api/intelligence/${orgB}/search?q=Overdue`, json("GET", outsider.token));
const crossOrgWork = (r.body.results?.work as { title: string }[] ?? []).some((w) => w.title.includes("Overdue work"));
check("search never returns another organisation's records", !crossOrgWork, r.body.results?.work);

/* --------------------------------------------------------------- teardown */

await db("operational_signals").whereIn("organisation_id", [orgA, orgB]).delete();
await db("notifications").where((qb) => qb.whereIn("organisation_id", [orgA, orgB]).orWhereIn("recipient_profile_id", [founder.id, alice.id, bob.id, outsider.id])).delete();
await db("contracts").where({ organisation_id: orgA }).delete();
await db("employment_records").where({ organisation_id: orgA }).delete();
await db("work_items").whereIn("id", createdWorkIds).delete();
await db("organisations").whereIn("id", [orgA, orgB]).delete();
await db("profiles").whereIn("id", [founder.id, alice.id, bob.id, outsider.id]).delete();

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
await db.destroy();
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Add the npm script**

In `node/package.json`, add alongside the other `check:*` scripts:
```json
    "check:intelligence": "tsx scripts/check-intelligence-phase6-api.ts",
```

- [ ] **Step 3: Run it against the dev server**

Run: `cd node && npm run dev` (background, if not already running from Task 9)
Run: `cd node && npm run check:intelligence`
Expected: `ALL CHECKS PASSED`. Fix any FAIL by re-reading the relevant service (do not weaken the assertion) — a fresh `git status`/diff review is appropriate if a fix touches more than the one file at fault.

- [ ] **Step 4: Run the full regression suite (Phases 1–5)**

Run each, with the dev server still running:
```bash
cd node
npm run check:api
npm run check:org
npm run check:hierarchy
npm run check:departments
npm run check:employment
npm run check:work
npm run check:work:phase2
npm run check:work:phase4
npm run check:projects
```
Expected: `ALL CHECKS PASSED` for every one. Phase 6 must not regress any of these — if one fails, the cause is almost certainly one of Task 2's exports/additions; fix the root cause there rather than in the failing phase's own files.

- [ ] **Step 5: Commit**

```bash
git add node/scripts/check-intelligence-phase6-api.ts node/package.json
git commit -m "test(phase6): add intelligence E2E check script and confirm no regression in phases 1-5"
```

---

## Task 11 — Frontend: `web/lib/intelligence.ts`

**Files:**
- Create: `web/lib/intelligence.ts`

**Interfaces:**
- Consumes: `apiRequest` (web/lib/api.ts), `WorkItem` (web/lib/work.ts).
- Produces: `AttentionItem`, `OrganisationOverview`, `ActivityEntry`, `SearchResults`, `MemberOperationalHistory` types and their fetch/resolve functions — consumed by Tasks 13–17.

- [ ] **Step 1: Write the lib file**

```ts
// web/lib/intelligence.ts
import { apiRequest } from "./api";

/* ------------------------------------------------------------------------
   Attention — mirrors node/src/intelligence/intelligence.signal.service.ts
   --------------------------------------------------------------------- */

export const SIGNAL_TYPES = [
  "work.overdue",
  "work.blocked",
  "work.stalled",
  "project.inactive",
  "project.target_approaching",
  "outcome.overdue",
  "contract.expiring",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  "work.overdue": "Work overdue",
  "work.blocked": "Work blocked",
  "work.stalled": "Work stalled",
  "project.inactive": "Project inactive",
  "project.target_approaching": "Project target approaching",
  "outcome.overdue": "Outcome overdue",
  "contract.expiring": "Contract expiring",
};

export function signalTypeLabel(type: string): string {
  return SIGNAL_TYPE_LABELS[type as SignalType] ?? type;
}

export type AttentionItem = {
  id: number;
  organisationId: number;
  type: string;
  entityType: string;
  entityId: number;
  status: "active" | "resolved";
  severity: "normal" | "high";
  message: string;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: number | null;
  resolution: string | null;
  actionUrl: string | null;
};

export function fetchAttention(organisationId: number): Promise<{ attention: AttentionItem[] }> {
  return apiRequest(`/api/intelligence/${organisationId}/attention`);
}

export function runAttentionScan(
  organisationId: number,
): Promise<{ message: string; attention: AttentionItem[] }> {
  return apiRequest(`/api/intelligence/${organisationId}/attention/scan`, { method: "POST" });
}

export function resolveAttentionItem(
  organisationId: number,
  signalId: number,
): Promise<{ message: string; attention: AttentionItem }> {
  return apiRequest(`/api/intelligence/${organisationId}/attention/${signalId}/resolve`, {
    method: "POST",
  });
}

/* ------------------------------------------------------------------------
   Overview
   --------------------------------------------------------------------- */

export type OrganisationOverview = {
  people: { activeMembers: number; occupiedPositions: number; vacantPositions: number };
  work: { total: number; open: number; completed: number; overdue: number; blocked: number; stalled: number };
  projects: { active: number; paused: number; completed: number; requiringAttention: number };
  outcomes: { total: number; open: number; completed: number; overdue: number; approachingTarget: number };
  attention: { active: number; byType: Record<SignalType, number> };
};

export function fetchOverview(organisationId: number): Promise<OrganisationOverview> {
  return apiRequest(`/api/intelligence/${organisationId}/overview`);
}

/* ------------------------------------------------------------------------
   Activity
   --------------------------------------------------------------------- */

export type ActivityEntry = { id: string; type: string; message: string; occurredAt: string };

export function fetchActivity(organisationId: number): Promise<{ activity: ActivityEntry[] }> {
  return apiRequest(`/api/intelligence/${organisationId}/activity`);
}

/* ------------------------------------------------------------------------
   Search
   --------------------------------------------------------------------- */

export type SearchResultItem = {
  type: "person" | "position" | "department" | "work" | "project" | "outcome";
  id: number;
  title: string;
  subtitle: string;
  url: string;
};

export type SearchResults = {
  query: string;
  results: Record<"people" | "positions" | "departments" | "work" | "projects" | "outcomes", SearchResultItem[]>;
};

export function searchOrganisation(organisationId: number, q: string): Promise<SearchResults> {
  return apiRequest(`/api/intelligence/${organisationId}/search?q=${encodeURIComponent(q)}`);
}

/* ------------------------------------------------------------------------
   Person operational history
   --------------------------------------------------------------------- */

export type MemberOperationalHistory = {
  memberId: number;
  profileId: number | null;
  membership: { id: number; title: string | null; organisationClassLabel: string; status: string; joinedAt: string | null; leftAt: string | null };
  structure: {
    positions: { positionId: number; positionName: string | null; startsAt: string; endsAt: string | null; isActive: boolean }[];
    departments: { id: number; name: string }[];
  };
  employment: {
    employmentRecord: { id: number; isCurrent: boolean; startDate: string; endDate: string | null };
    contracts: { id: number; contractTypeLabel: string; isActive: boolean; startDate: string; endDate: string | null }[];
  }[];
  work: {
    items: { id: number; title: string; status: string }[];
    reports: { id: number; workItemId: number; state: string; submittedAt: string | null; reviewedAt: string | null }[];
    evidence: { id: number; workItemId: number; fileName: string; createdAt: string }[];
  };
  projects: {
    memberships: { id: number; name: string; status: string }[];
    outcomesOwned: { id: number; title: string; status: string }[];
  };
};

export function fetchMemberHistory(
  organisationId: number,
  memberId: number,
): Promise<MemberOperationalHistory> {
  return apiRequest(`/api/intelligence/${organisationId}/members/${memberId}/history`);
}
```

- [ ] **Step 2: Typecheck the frontend types compile**

Run: `cd web && npx tsc --noEmit` (or the project's configured `npm run typecheck` if one is added later — check `web/package.json` for the actual script name first)
Expected: no new errors from this file (it has no consumers yet, so nothing else can break).

- [ ] **Step 3: Commit**

```bash
git add web/lib/intelligence.ts
git commit -m "feat(phase6): add frontend intelligence API client"
```

---

## Task 12 — Frontend: `OrganisationTabs` sub-nav + wire into existing screens

**Files:**
- Create: `web/components/app/organisation/organisation-tabs.tsx`
- Modify: `web/components/app/organisation/organisation-screen.tsx`
- Modify: `web/components/app/hierarchy/hierarchy-screen.tsx`

**Interfaces:**
- Produces: `<OrganisationTabs organisationId={number} />`, used by every organisation-scoped page from here on (Tasks 13–17 place it too).

- [ ] **Step 1: Write the tabs component**

```tsx
// web/components/app/organisation/organisation-tabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "", label: "About" },
  { slug: "overview", label: "Overview" },
  { slug: "attention", label: "Attention" },
  { slug: "hierarchy", label: "Structure" },
  { slug: "activity", label: "Activity" },
  { slug: "search", label: "Search" },
] as const;

/**
 * The Organisation area's sub-navigation. One organisation, several lenses on
 * it — About (who it is), Overview (current operational counts), Attention
 * (what needs a look), Structure (positions/departments — the existing
 * hierarchy screen), Activity (what happened), Search (find a record fast).
 */
export function OrganisationTabs({ organisationId }: { organisationId: number }) {
  const pathname = usePathname();
  const base = `/organisation/${organisationId}`;

  return (
    <nav className="flex flex-wrap gap-1 border-b border-yz-neutral-200">
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = pathname === href;

        return (
          <Link
            key={tab.label}
            href={href}
            className={`rounded-t-sm px-3 py-2 text-[12.5px] font-bold transition-colors ${
              active
                ? "border-b-2 border-yz-ink text-yz-ink"
                : "border-b-2 border-transparent text-yz-neutral-600 hover:text-yz-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Wire it into `organisation-screen.tsx`**

In `web/components/app/organisation/organisation-screen.tsx`, add the import:
```tsx
import { OrganisationTabs } from "./organisation-tabs";
```

Rename the existing "Overview" `PanelGroup` title to "About" (it is the organisation's static description/type/country info, not Phase 6's operational overview — this avoids the same word meaning two different things one page apart):
```tsx
        <PanelGroup title="Overview">
```
becomes
```tsx
        <PanelGroup title="About">
```

Insert `<OrganisationTabs organisationId={organisation.id} />` right after the `<PageHeader ... />` block and before the `<Panel>` block, i.e.:
```tsx
      <PageHeader
        ...
      />

      <OrganisationTabs organisationId={organisation.id} />

      <Panel>
```

- [ ] **Step 3: Wire it into `hierarchy-screen.tsx`**

In `web/components/app/hierarchy/hierarchy-screen.tsx`, add the import:
```tsx
import { OrganisationTabs } from "../organisation/organisation-tabs";
```

Insert it the same way, right after the existing `<PageHeader ... />` and before `<Panel>`:
```tsx
      <PageHeader
        ...
      />

      <OrganisationTabs organisationId={organisationId} />

      <Panel>
```

(Also add it to the `forbidden` early-return branch's `<PageHeader title="Organisation Hierarchy" />` block, since `organisationId` is already in scope there as a prop, so the tab bar is visible even on the "admins only" message.)

- [ ] **Step 4: Manual check**

Run: `cd web && npm run dev` (background)
Visit `/organisation/<id>` and `/organisation/<id>/hierarchy` in a browser; confirm the tab bar renders, "About" now labels the old Overview panel, and clicking "Structure" navigates correctly with the active tab underlined. (The other four tabs 404 until Tasks 13–17 add their pages — that is expected at this point.)

- [ ] **Step 5: Commit**

```bash
git add web/components/app/organisation/organisation-tabs.tsx web/components/app/organisation/organisation-screen.tsx web/components/app/hierarchy/hierarchy-screen.tsx
git commit -m "feat(phase6): add organisation sub-nav and disambiguate the About panel"
```

---

## Task 13 — Frontend: Overview screen + route

**Files:**
- Create: `web/components/app/intelligence/overview-screen.tsx`
- Create: `web/app/(app)/organisation/[id]/overview/page.tsx`

**Interfaces:**
- Consumes: `fetchOverview`, `OrganisationOverview`, `signalTypeLabel` (web/lib/intelligence.ts, Task 11), `OrganisationTabs` (Task 12), `fetchOrganisation` (web/lib/organisation.ts).

- [ ] **Step 1: Write the route**

```tsx
// web/app/(app)/organisation/[id]/overview/page.tsx
import { notFound } from "next/navigation";

import { OverviewScreen } from "@/components/app/intelligence/overview-screen";

export default async function OrganisationOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organisationId = Number(id);

  if (!Number.isInteger(organisationId) || organisationId <= 0) {
    notFound();
  }

  return <OverviewScreen organisationId={organisationId} />;
}
```

- [ ] **Step 2: Write the screen**

```tsx
// web/components/app/intelligence/overview-screen.tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchOverview, signalTypeLabel, type OrganisationOverview } from "@/lib/intelligence";
import { fetchOrganisation, type Organisation } from "@/lib/organisation";
import { OrganisationTabs } from "../organisation/organisation-tabs";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-yz-neutral-200 px-3.5 py-3">
      <div className="text-[20px] font-extrabold text-yz-ink">{value}</div>
      <div className="mt-0.5 text-[11.5px] font-bold uppercase tracking-wide text-yz-neutral-500">{label}</div>
    </div>
  );
}

/**
 * Factual current state, derived from Work/Projects/Outcomes/People/Attention
 * — never a productivity score. Section 4 of the Phase 6 spec: what an
 * organisation's operational state actually is, in one screen.
 */
export function OverviewScreen({ organisationId }: { organisationId: number }) {
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [overview, setOverview] = useState<OrganisationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const [orgResult, overviewResult] = await Promise.all([
        fetchOrganisation(organisationId),
        fetchOverview(organisationId),
      ]);

      setOrganisation(orgResult.organisation);
      setOverview(overviewResult);
      setError(null);
      setForbidden(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setForbidden(true);
      } else {
        setError(failureMessage(caught));
      }
    }
  }, [organisationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (forbidden) {
    return (
      <div className="space-y-3">
        <PageHeader title="Overview" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">Only an administrator can view this organisation's overview.</StatusMessage>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <PageHeader title="Overview" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">{error}</StatusMessage>
      </div>
    );
  }

  if (!overview || !organisation) {
    return <p className="text-[13px] text-yz-neutral-600">Loading…</p>;
  }

  const activeSignalEntries = Object.entries(overview.attention.byType).filter(([, count]) => count > 0);

  return (
    <div className="space-y-3">
      <PageHeader title="Overview" description={organisation.name} />
      <OrganisationTabs organisationId={organisationId} />

      <Panel>
        <PanelGroup title="People">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Active members" value={overview.people.activeMembers} />
            <Stat label="Occupied positions" value={overview.people.occupiedPositions} />
            <Stat label="Vacant positions" value={overview.people.vacantPositions} />
          </div>
        </PanelGroup>

        <PanelGroup title="Work">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Total" value={overview.work.total} />
            <Stat label="Open" value={overview.work.open} />
            <Stat label="Completed" value={overview.work.completed} />
            <Stat label="Overdue" value={overview.work.overdue} />
            <Stat label="Blocked" value={overview.work.blocked} />
            <Stat label="Stalled" value={overview.work.stalled} />
          </div>
        </PanelGroup>

        <PanelGroup title="Projects">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Active" value={overview.projects.active} />
            <Stat label="Paused" value={overview.projects.paused} />
            <Stat label="Completed" value={overview.projects.completed} />
            <Stat label="Requiring attention" value={overview.projects.requiringAttention} />
          </div>
        </PanelGroup>

        <PanelGroup title="Outcomes">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Total" value={overview.outcomes.total} />
            <Stat label="Open" value={overview.outcomes.open} />
            <Stat label="Completed" value={overview.outcomes.completed} />
            <Stat label="Overdue" value={overview.outcomes.overdue} />
            <Stat label="Approaching target" value={overview.outcomes.approachingTarget} />
          </div>
        </PanelGroup>

        <PanelGroup title={`Attention (${overview.attention.active})`}>
          {activeSignalEntries.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">Nothing needs attention right now.</p>
          ) : (
            <ul className="space-y-1.5">
              {activeSignalEntries.map(([type, count]) => (
                <li key={type} className="flex items-center justify-between text-[13px] text-yz-neutral-700">
                  <span>{signalTypeLabel(type)}</span>
                  <span className="font-bold text-yz-ink">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit` (or the repo's configured frontend typecheck script)
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/app/intelligence/overview-screen.tsx "web/app/(app)/organisation/[id]/overview/page.tsx"
git commit -m "feat(phase6): add Organisation Overview screen"
```

---

## Task 14 — Frontend: Attention screen + route

**Files:**
- Create: `web/components/app/intelligence/attention-screen.tsx`
- Create: `web/app/(app)/organisation/[id]/attention/page.tsx`

**Interfaces:**
- Consumes: `fetchAttention`, `runAttentionScan`, `resolveAttentionItem`, `AttentionItem`, `signalTypeLabel` (web/lib/intelligence.ts).

- [ ] **Step 1: Write the route**

```tsx
// web/app/(app)/organisation/[id]/attention/page.tsx
import { notFound } from "next/navigation";

import { AttentionScreen } from "@/components/app/intelligence/attention-screen";

export default async function OrganisationAttentionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organisationId = Number(id);

  if (!Number.isInteger(organisationId) || organisationId <= 0) {
    notFound();
  }

  return <AttentionScreen organisationId={organisationId} />;
}
```

- [ ] **Step 2: Write the screen**

```tsx
// web/components/app/intelligence/attention-screen.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import {
  fetchAttention,
  resolveAttentionItem,
  runAttentionScan,
  signalTypeLabel,
  type AttentionItem,
} from "@/lib/intelligence";
import { OrganisationTabs } from "../organisation/organisation-tabs";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";
}

function relativeDetected(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Operational conditions that currently need a look — never a performance
 * dashboard. Each row names the record, why it is here, and when it was
 * first detected; resolving one is a deliberate acknowledgement, not a fix
 * applied on the record itself (fix the record on its own screen; come back
 * here and mark it resolved, or let the next scan clear it automatically
 * once the condition is no longer true).
 */
export function AttentionScreen({ organisationId }: { organisationId: number }) {
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchAttention(organisationId);
      setItems(result.attention);
      setError(null);
      setForbidden(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setForbidden(true);
      } else {
        setError(failureMessage(caught));
      }
    }
  }, [organisationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function rescan() {
    setScanning(true);
    setStatus(null);

    try {
      const result = await runAttentionScan(organisationId);
      setItems(result.attention);
      setStatus(result.message);
    } catch (caught) {
      setError(failureMessage(caught));
    } finally {
      setScanning(false);
    }
  }

  async function resolve(item: AttentionItem) {
    setBusyId(item.id);

    try {
      await resolveAttentionItem(organisationId, item.id);
      setItems((current) => current?.filter((entry) => entry.id !== item.id) ?? current);
    } catch (caught) {
      setError(failureMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  if (forbidden) {
    return (
      <div className="space-y-3">
        <PageHeader title="Attention" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">Only an administrator can view this organisation's attention items.</StatusMessage>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Attention"
        description="Operational conditions detected from Work, Projects, Outcomes and Contracts."
        actions={
          <Button size="sm" variant="secondary" disabled={scanning} onClick={() => void rescan()}>
            {scanning ? "Scanning…" : "Rescan"}
          </Button>
        }
      />

      <OrganisationTabs organisationId={organisationId} />

      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {status && <StatusMessage tone="ok">{status}</StatusMessage>}

      <Panel>
        <PanelGroup title={items ? `${items.length} active` : "Attention"}>
          {items === null ? (
            <p className="text-[13px] text-yz-neutral-600">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">Nothing needs attention right now.</p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      {item.severity === "high" && (
                        <span className="rounded-sm border border-yz-danger-line bg-yz-danger-bg px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-yz-danger-ink">
                          High
                        </span>
                      )}
                      <span className="text-[11.5px] font-bold uppercase tracking-wide text-yz-neutral-500">
                        {signalTypeLabel(item.type)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-yz-ink">{item.message}</span>
                    <span className="mt-0.5 block text-[11.5px] text-yz-neutral-500">
                      Detected {relativeDetected(item.detectedAt)}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {item.actionUrl && (
                      <Link
                        href={item.actionUrl}
                        className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
                      >
                        View
                      </Link>
                    )}

                    <Button size="sm" variant="ghost" disabled={busyId === item.id} onClick={() => void resolve(item)}>
                      {busyId === item.id ? "Resolving…" : "Resolve"}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/app/intelligence/attention-screen.tsx "web/app/(app)/organisation/[id]/attention/page.tsx"
git commit -m "feat(phase6): add Attention Center screen"
```

---

## Task 15 — Frontend: Activity screen + route

**Files:**
- Create: `web/components/app/intelligence/activity-screen.tsx`
- Create: `web/app/(app)/organisation/[id]/activity/page.tsx`

**Interfaces:**
- Consumes: `fetchActivity`, `ActivityEntry` (web/lib/intelligence.ts).

- [ ] **Step 1: Write the route**

```tsx
// web/app/(app)/organisation/[id]/activity/page.tsx
import { notFound } from "next/navigation";

import { ActivityScreen } from "@/components/app/intelligence/activity-screen";

export default async function OrganisationActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organisationId = Number(id);

  if (!Number.isInteger(organisationId) || organisationId <= 0) {
    notFound();
  }

  return <ActivityScreen organisationId={organisationId} />;
}
```

- [ ] **Step 2: Write the screen**

```tsx
// web/components/app/intelligence/activity-screen.tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchActivity, type ActivityEntry } from "@/lib/intelligence";
import { OrganisationTabs } from "../organisation/organisation-tabs";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** What has been happening in this organisation — real business events, not a raw database log. */
export function ActivityScreen({ organisationId }: { organisationId: number }) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchActivity(organisationId);
      setEntries(result.activity);
      setError(null);
      setForbidden(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setForbidden(true);
      } else {
        setError(failureMessage(caught));
      }
    }
  }, [organisationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (forbidden) {
    return (
      <div className="space-y-3">
        <PageHeader title="Activity" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">Only an administrator can view this organisation's activity.</StatusMessage>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Activity" description="What has been happening in this organisation." />
      <OrganisationTabs organisationId={organisationId} />

      {error && <StatusMessage tone="error">{error}</StatusMessage>}

      <Panel>
        <PanelGroup title="Recent activity">
          {entries === null ? (
            <p className="text-[13px] text-yz-neutral-600">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {entries.map((entry) => (
                <li key={entry.id} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="text-[13px] text-yz-ink">{entry.message}</p>
                  <p className="mt-0.5 text-[11.5px] text-yz-neutral-500">{formatWhen(entry.occurredAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/app/intelligence/activity-screen.tsx "web/app/(app)/organisation/[id]/activity/page.tsx"
git commit -m "feat(phase6): add Organisation Activity screen"
```

---

## Task 16 — Frontend: Search screen + route

**Files:**
- Create: `web/components/app/intelligence/search-screen.tsx`
- Create: `web/app/(app)/organisation/[id]/search/page.tsx`

**Interfaces:**
- Consumes: `searchOrganisation`, `SearchResults`, `SearchResultItem` (web/lib/intelligence.ts).

- [ ] **Step 1: Write the route**

```tsx
// web/app/(app)/organisation/[id]/search/page.tsx
import { notFound } from "next/navigation";

import { SearchScreen } from "@/components/app/intelligence/search-screen";

export default async function OrganisationSearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organisationId = Number(id);

  if (!Number.isInteger(organisationId) || organisationId <= 0) {
    notFound();
  }

  return <SearchScreen organisationId={organisationId} />;
}
```

- [ ] **Step 2: Write the screen**

```tsx
// web/components/app/intelligence/search-screen.tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { TextField } from "@/components/ui/field";
import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { searchOrganisation, type SearchResultItem, type SearchResults } from "@/lib/intelligence";
import { OrganisationTabs } from "../organisation/organisation-tabs";

const CATEGORY_LABELS: Record<keyof SearchResults["results"], string> = {
  people: "People",
  positions: "Positions",
  departments: "Departments",
  work: "Work",
  projects: "Projects",
  outcomes: "Outcomes",
};

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";
}

function ResultRow({ item }: { item: SearchResultItem }) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <Link href={item.url} className="flex items-center justify-between gap-3 hover:text-yz-ink">
        <span className="min-w-0 truncate text-[13px] font-semibold text-yz-ink">{item.title}</span>
        <span className="shrink-0 text-[11.5px] text-yz-neutral-500">{item.subtitle}</span>
      </Link>
    </li>
  );
}

/** Fast navigation to the relevant person, position, department, Work, Project or Outcome — never a full-text engine. */
export function SearchScreen({ organisationId }: { organisationId: number }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [searching, setSearching] = useState(false);

  async function runSearch(q: string) {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }

    setSearching(true);

    try {
      const result = await searchOrganisation(organisationId, q);
      setResults(result);
      setError(null);
      setForbidden(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setForbidden(true);
      } else {
        setError(failureMessage(caught));
      }
    } finally {
      setSearching(false);
    }
  }

  if (forbidden) {
    return (
      <div className="space-y-3">
        <PageHeader title="Search" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">Only an administrator can search this organisation.</StatusMessage>
      </div>
    );
  }

  const categories = results
    ? (Object.entries(results.results) as [keyof SearchResults["results"], SearchResultItem[]][])
    : [];
  const totalResults = categories.reduce((sum, [, items]) => sum + items.length, 0);

  return (
    <div className="space-y-3">
      <PageHeader title="Search" description="Find a person, position, department, Work item, Project or Outcome." />
      <OrganisationTabs organisationId={organisationId} />

      {error && <StatusMessage tone="error">{error}</StatusMessage>}

      <Panel>
        <PanelGroup title="Search">
          <TextField
            id="organisationSearch"
            label="Query"
            placeholder="Start typing…"
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              void runSearch(next);
            }}
          />

          {searching && <p className="mt-2 text-[12.5px] text-yz-neutral-600">Searching…</p>}

          {results && query.trim().length >= 2 && totalResults === 0 && !searching && (
            <p className="mt-2 text-[12.5px] text-yz-neutral-600">No matches.</p>
          )}
        </PanelGroup>

        {categories
          .filter(([, items]) => items.length > 0)
          .map(([category, items]) => (
            <PanelGroup key={category} title={`${CATEGORY_LABELS[category]} (${items.length})`}>
              <ul className="divide-y divide-yz-neutral-200">
                {items.map((item) => (
                  <ResultRow key={`${item.type}-${item.id}`} item={item} />
                ))}
              </ul>
            </PanelGroup>
          ))}
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/app/intelligence/search-screen.tsx "web/app/(app)/organisation/[id]/search/page.tsx"
git commit -m "feat(phase6): add Organisation Search screen"
```

---

## Task 17 — Frontend: Person Operational History screen + route + People-panel link

**Files:**
- Create: `web/components/app/intelligence/member-history-screen.tsx`
- Create: `web/app/(app)/organisation/[id]/people/[memberId]/history/page.tsx`
- Modify: `web/components/app/organisation/people-panel.tsx`

**Interfaces:**
- Consumes: `fetchMemberHistory`, `MemberOperationalHistory` (web/lib/intelligence.ts).

- [ ] **Step 1: Write the route**

```tsx
// web/app/(app)/organisation/[id]/people/[memberId]/history/page.tsx
import { notFound } from "next/navigation";

import { MemberHistoryScreen } from "@/components/app/intelligence/member-history-screen";

export default async function MemberHistoryPage({
  params,
}: {
  params: Promise<{ id: string; memberId: string }>;
}) {
  const { id, memberId } = await params;
  const organisationId = Number(id);
  const memberIdNumber = Number(memberId);

  if (
    !Number.isInteger(organisationId) ||
    organisationId <= 0 ||
    !Number.isInteger(memberIdNumber) ||
    memberIdNumber <= 0
  ) {
    notFound();
  }

  return <MemberHistoryScreen organisationId={organisationId} memberId={memberIdNumber} />;
}
```

- [ ] **Step 2: Write the screen**

```tsx
// web/components/app/intelligence/member-history-screen.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchMemberHistory, type MemberOperationalHistory } from "@/lib/intelligence";
import { OrganisationTabs } from "../organisation/organisation-tabs";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "present";
}

/**
 * One person's factual operational record in this organisation — never a
 * résumé, never a skills or rating inference. Everything here is a link back
 * to an existing authoritative record (membership, occupancy, employment,
 * Work, Projects, Outcomes).
 */
export function MemberHistoryScreen({
  organisationId,
  memberId,
}: {
  organisationId: number;
  memberId: number;
}) {
  const [history, setHistory] = useState<MemberOperationalHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchMemberHistory(organisationId, memberId);
      setHistory(result);
      setError(null);
      setForbidden(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setForbidden(true);
      } else {
        setError(failureMessage(caught));
      }
    }
  }, [organisationId, memberId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (forbidden) {
    return (
      <div className="space-y-3">
        <PageHeader title="Operational history" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">Only an administrator can view this person's operational history.</StatusMessage>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <PageHeader title="Operational history" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">{error}</StatusMessage>
      </div>
    );
  }

  if (!history) {
    return <p className="text-[13px] text-yz-neutral-600">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Operational history"
        description={history.membership.title ?? history.membership.organisationClassLabel}
      />
      <OrganisationTabs organisationId={organisationId} />

      <Panel>
        <PanelGroup title="Structure">
          {history.structure.positions.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No positions held.</p>
          ) : (
            <ul className="space-y-1 text-[12.5px] leading-6 text-yz-neutral-700">
              {history.structure.positions.map((row, index) => (
                <li key={index}>
                  {row.positionName ?? "Unknown position"} — {formatDate(row.startsAt)} to{" "}
                  {row.isActive ? "present" : formatDate(row.endsAt)}
                </li>
              ))}
            </ul>
          )}

          {history.structure.departments.length > 0 && (
            <p className="mt-2 text-[12.5px] text-yz-neutral-600">
              Departments: {history.structure.departments.map((d) => d.name).join(", ")}
            </p>
          )}
        </PanelGroup>

        <PanelGroup title="Employment">
          {history.employment.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No employment records.</p>
          ) : (
            <ul className="space-y-2">
              {history.employment.map((entry) => (
                <li key={entry.employmentRecord.id} className="text-[12.5px] leading-6 text-yz-neutral-700">
                  <span className="font-semibold text-yz-ink">
                    {formatDate(entry.employmentRecord.startDate)} —{" "}
                    {entry.employmentRecord.isCurrent ? "present" : formatDate(entry.employmentRecord.endDate)}
                  </span>
                  {entry.contracts.length > 0 && (
                    <ul className="ml-3 list-disc">
                      {entry.contracts.map((contract) => (
                        <li key={contract.id}>
                          {contract.contractTypeLabel} — {formatDate(contract.startDate)} to{" "}
                          {contract.isActive ? "present" : formatDate(contract.endDate)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>

        <PanelGroup title="Work">
          {history.work.items.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No Work found.</p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {history.work.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <Link href={`/work/${item.id}`} className="min-w-0 truncate text-[13px] font-semibold text-yz-ink hover:underline">
                    {item.title}
                  </Link>
                  <span className="shrink-0 text-[11.5px] text-yz-neutral-500">{item.status}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-[12px] text-yz-neutral-600">
            {history.work.reports.length} report(s) authored · {history.work.evidence.length} piece(s) of evidence recorded.
          </p>
        </PanelGroup>

        <PanelGroup title="Projects">
          {history.projects.memberships.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No Project participation.</p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {history.projects.memberships.map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <Link
                    href={`/projects/${organisationId}/${project.id}`}
                    className="min-w-0 truncate text-[13px] font-semibold text-yz-ink hover:underline"
                  >
                    {project.name}
                  </Link>
                  <span className="shrink-0 text-[11.5px] text-yz-neutral-500">{project.status}</span>
                </li>
              ))}
            </ul>
          )}

          {history.projects.outcomesOwned.length > 0 && (
            <p className="mt-2 text-[12px] text-yz-neutral-600">
              Owns {history.projects.outcomesOwned.length} outcome(s):{" "}
              {history.projects.outcomesOwned.map((o) => o.title).join(", ")}
            </p>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 3: Add a "History" link in `people-panel.tsx`**

In `web/components/app/organisation/people-panel.tsx`, add `Link` to the imports:
```tsx
import Link from "next/link";
```

In `renderPerson`, add a link next to the existing "Standing"/"Employment" buttons (inside the `canAdminister &&` block, before the "Standing" button):
```tsx
          {canAdminister && (
            <Link
              href={`/organisation/${organisationId}/people/${member.id}/history`}
              className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
            >
              History
            </Link>
          )}

          {canAdminister && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busyMember === member.id}
              onClick={() => setEditing(member)}
            >
              Standing
            </Button>
          )}
```

(`organisationId` is already a prop of `PeoplePanel` and in scope inside `renderPerson`, which is a closure over the component's props — confirm this before finalizing.)

- [ ] **Step 4: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/components/app/intelligence/member-history-screen.tsx "web/app/(app)/organisation/[id]/people/[memberId]/history/page.tsx" web/components/app/organisation/people-panel.tsx
git commit -m "feat(phase6): add Person Operational History screen and link from People"
```

---

## Task 18 — Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Backend typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Backend regression + Phase 6 check scripts (dev server running)**

Run (in order, all against `npm run dev`):
```bash
cd node
npm run check:api
npm run check:org
npm run check:hierarchy
npm run check:departments
npm run check:employment
npm run check:work
npm run check:work:phase2
npm run check:work:phase4
npm run check:projects
npm run check:intelligence
```
Expected: `ALL CHECKS PASSED` for all ten.

- [ ] **Step 3: Frontend lint and build**

Run: `cd web && npm run lint` (check `web/package.json` for the exact script name first)
Expected: no errors.

Run: `cd web && npm run build`
Expected: build succeeds, no type errors, no failing pages (the new dynamic routes under `/organisation/[id]/...` must build cleanly).

- [ ] **Step 4: Browser verification**

With both `node` (`npm run dev`, port 5000) and `web` (`npm run dev`, its configured port) running, use the claude-in-chrome tools to:
1. Sign in as a real admin account (or register one) and open an organisation with existing Phase 1–5 data.
2. Visit `/organisation/[id]` — confirm "About" (renamed) still renders correctly and the new tab bar appears.
3. Click through Overview, Attention, Structure, Activity, Search tabs — confirm each loads without a console error, shows correct counts/lists, and empty states render cleanly for an organisation with nothing flagged.
4. Trigger a "Rescan" on Attention and confirm the list updates; resolve one item and confirm it disappears from the active list.
5. Type a query on Search and confirm results appear per category with working links.
6. From People, click "History" on a member and confirm the Person Operational History screen loads.
7. Re-visit `/organisation/[id]/hierarchy`, `/work`, `/projects` to confirm Phase 1–5 screens are unaffected.
8. Check the browser console (`read_console_messages`) for errors on every visited page.
9. Resize to a narrow viewport and confirm the new screens stay responsive (no horizontal scroll on the page body; tables/lists that need it scroll in their own container).

Record any failure found and fix it before proceeding — do not defer a browser-found bug into "known limitations."

- [ ] **Step 5: No commit for this task** (verification only — proceed to Task 19 once everything above passes).

---

## Task 19 — Final commit and push

**Files:** whatever is left uncommitted after Tasks 1–18 (should be nothing, since every prior task ends with its own commit — this task is the final `git status`/push per the Phase 6 spec's own instruction).

- [ ] **Step 1: Confirm a clean, fully-committed tree**

Run: `git status`
Expected: `nothing to commit, working tree clean`. If anything is unstaged (e.g. a fix made during Task 18's browser pass), stage and commit it now with an appropriately scoped message before proceeding.

- [ ] **Step 2: Push**

Run: `git push origin main`
Expected: push succeeds, no conflicts.

- [ ] **Step 3: Final status check**

Run: `git status`
Expected: `nothing to commit, working tree clean` and branch up to date with `origin/main`.

---

## Self-Review Notes (for the implementer to re-check before Task 19)

- **Spec coverage:** §2 signals → Task 4. §3 Attention → Task 4 + 14. §4 Overview → Task 5 + 13. §5 Activity → Task 6 + 15. §6/§7 Person history/evidence → Task 8 + 17. §8 Search → Task 7 + 16. §9 notifications-vs-attention → Task 4 reuses existing notifications, adds none new. §10 one scheduler → Task 4 reuses `computeAndSync`/`computeAndSyncExpiry`, no cron added (scan runs on GET/POST like the existing stalled/expiry endpoints already do). §12 authorization → every service in Tasks 4–8 calls `requireOccupancyCapability`. §13 migrations → Task 1, one table only. §14 frontend nav → Task 12. §16 testing → Task 10. §17 E2E scenario → Task 10's check script. §18 regression → Task 18. §19 browser → Task 18 Step 4. §24 git → Task 19.
- **Known, deliberate scope decisions to restate in the completion report:** admin-only gating for all five new endpoint groups (matches existing precedent, see Global Constraints); sticky manual resolution (a resolved signal is not reopened by a later scan of the same still-true condition); `memberId`-addressed history route instead of the spec's suggested `profileId` path; "projects requiring attention" counts direct project-level signals only, not work-item signals traced back to a parent project; contract "changed" activity events are limited to "created" (status/date changes are visible on the Employment panel itself, not surfaced as a separate global activity type, to avoid noisy/ambiguous wording).
