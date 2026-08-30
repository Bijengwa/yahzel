# Work Engine W0 (Backend Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the minimum usable Work backend (W0) to the existing Node/Express/Knex/PostgreSQL API: a standalone Work Item that one person creates and assigns to another person in the same organisation, with assignment history that is never overwritten.

**Architecture:** A new `node/src/work/` domain module, following the exact routes → controller → service → repository → record/validation layering already used by `node/src/organisation/`. Two new tables (`work_items`, `work_assignments`) added by one migration. Work reuses the organisation module's existing membership repository functions (`findMembership`, `findOrganisationById`) rather than duplicating membership logic. No frontend, no notifications, no projects/tenders/contracts, no hierarchy — see Global Constraints.

**Tech Stack:** TypeScript (strict, `nodenext`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Express 5, Knex 3 + PostgreSQL, `tsx` for running/watching, no unit-test framework — this codebase verifies backend features with a single end-to-end HTTP script per domain (`node/scripts/check-<domain>-api.ts`) run against `npm run dev`.

## Global Constraints

- Backend-only. Do not touch anything under `web/`. Do not create Next.js API routes.
- `node/` is the only backend. Do not invent a second auth mechanism; reuse `requireAuth` / `currentUserId` from `node/src/middleware/require-auth.ts` unchanged.
- The actor's identity is **always** `currentUserId(req)`. Never read an actor/creator/assigner id from `req.body` or `req.params`.
- A Work Item never requires a project/tender/contract — it must work fully standalone.
- Assignment is a separate table from `work_items` with full history. Never model "current assignee" as a mutable column on `work_items`. Never delete an assignment row.
- Exactly one assignment may have `status = 'active'` per Work Item at any time (enforced by a partial unique index).
- W0 authorization uses only concepts that already exist (organisation membership, active status, who created a Work Item). Do not invent "manager"/"department head"/hierarchy concepts.
- W0 visibility is exactly: creator of the Work Item, current or past assignee, current or past assigner. Nothing broader (no "all org admins can see everything" — that is a hierarchy-shaped expansion this phase deliberately excludes).
- An inaccessible Work Item is reported as `404 "That work item could not be found."` — never `403` — so its existence is never revealed to somebody uninvolved. `403` is reserved for a caller who can already see the item but lacks permission for the specific action.
- Do not build: departments, teams, reporting hierarchy, `reports_to`, child tasks/`parent_id`, work updates/timeline, evidence/files, dependencies, projects, tenders, contracts, cross-organisation visibility, ratings, CV integration, or Work notifications. Stop at W0.
- Follow existing conventions exactly: `Validated<T>` / `FieldError` pattern from `profile.validation.ts`, the `XError` class + `handleFailure` + `readId` pattern from `organisation.controller.ts`/`organisation.service.ts`, `db.transaction` for multi-row writes, migrations numbered sequentially (next is `008`).
- This codebase has no per-function unit tests. "Write the failing test" steps below are adapted to this codebase's actual convention: after each file, verify with `npx tsc --noEmit` (from `node/`); the real behavioral test is the end-to-end script built in Task 7 and run in Task 8.

---

### Task 1: Migration — `work_items` and `work_assignments`

**Files:**
- Create: `node/src/db/migrations/008_create_work.ts`

**Interfaces:**
- Produces: tables `work_items` (id, organisation_id, title, description, expected_output, status, progress, due_at, created_by, created_at, updated_at) and `work_assignments` (id, work_item_id, assigned_by, assignee_profile_id, instructions, status, created_at, updated_at), plus a partial unique index `work_assignments_active_unique` on `work_assignments(work_item_id) WHERE status = 'active'`.

- [ ] **Step 1: Write the migration**

```ts
import type { Knex } from "knex";

/**
 * W0 — the minimum usable Work engine.
 *
 * Two tables, and deliberately no more:
 *
 *   work_items       — a standalone unit of work. It does not belong to a
 *                       project, tender or contract yet — those are later
 *                       phases, and a Work Item must work without any of
 *                       them.
 *   work_assignments — who a Work Item is given to. This is never a column
 *                       on work_items: an assignment is its own row so a
 *                       reassignment is a new row, not an overwrite. Only one
 *                       assignment may be "active" for a Work Item at a time,
 *                       enforced by the partial unique index below; every
 *                       earlier assignment is kept, marked "reassigned", and
 *                       is never deleted.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("work_items", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table.string("title", 200).notNullable();
    table.text("description").nullable();
    table.text("expected_output").nullable();

    // not_started | in_progress | blocked | waiting_review | done.
    // Validated in work.validation.ts.
    table.string("status", 20).notNullable().defaultTo("not_started");

    table.integer("progress").notNullable().defaultTo(0);

    table.timestamp("due_at", { useTz: true }).nullable();

    table
      .integer("created_by")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["organisation_id"], "work_items_organisation_index");
    table.index(["created_by"], "work_items_created_by_index");
  });

  await knex.schema.createTable("work_assignments", (table) => {
    table.increments("id").primary();

    table
      .integer("work_item_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("work_items")
      .onDelete("CASCADE");

    table
      .integer("assigned_by")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table
      .integer("assignee_profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table.text("instructions").nullable();

    // active | completed | cancelled | reassigned.
    table.string("status", 20).notNullable().defaultTo("active");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["work_item_id"], "work_assignments_work_item_index");
    table.index(["assignee_profile_id"], "work_assignments_assignee_index");
    table.index(["assigned_by"], "work_assignments_assigned_by_index");
  });

  // Only one assignment may be active per Work Item. This is a partial
  // index, so completed/cancelled/reassigned rows never count toward it —
  // the same technique organisation_invitations already uses (migration 005)
  // to keep only *open* invitations unique.
  await knex.raw(`
    CREATE UNIQUE INDEX work_assignments_active_unique
      ON work_assignments (work_item_id)
      WHERE status = 'active'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("work_assignments");
  await knex.schema.dropTableIfExists("work_items");
}
```

- [ ] **Step 2: Run the migration against the dev database**

Run: `cd node && npm run db:migrate`
Expected: output lists `Batch N run: 1 migrations`, including `008_create_work.ts`. If `DATABASE_URL` is not configured in this environment, note that in your report instead of skipping silently — this migration must be verified once a database is reachable.

- [ ] **Step 3: Commit**

```bash
git add node/src/db/migrations/008_create_work.ts
git commit -m "feat(work): add work_items and work_assignments tables"
```

---

### Task 2: `work.record.ts` — table names, record types, status vocabulary

**Files:**
- Create: `node/src/work/work.record.ts`

**Interfaces:**
- Produces: `WORK_ITEMS_TABLE`, `WORK_ASSIGNMENTS_TABLE`, `WorkStatus`, `isWorkStatus(value): value is WorkStatus`, `AssignmentStatus`, `isAssignmentStatus(value): value is AssignmentStatus`, `WorkItemRecord`, `WorkAssignmentRecord` — all consumed by every other Work file.

- [ ] **Step 1: Write the file**

```ts
/**
 * The two rows behind the Work engine, mirroring migration 008.
 *
 * A Work Item never carries who it is assigned to. That fact lives in
 * work_assignments so a reassignment is a new row, not an overwritten
 * column — the same "history, never overwritten" idea organisation
 * memberships already use.
 */

export const WORK_ITEMS_TABLE = "work_items";
export const WORK_ASSIGNMENTS_TABLE = "work_assignments";

export const WORK_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "waiting_review",
  "done",
] as const;

export type WorkStatus = (typeof WORK_STATUSES)[number];

export function isWorkStatus(value: string): value is WorkStatus {
  return (WORK_STATUSES as readonly string[]).includes(value);
}

/** active | completed | cancelled | reassigned. Never deleted. */
export const ASSIGNMENT_STATUSES = [
  "active",
  "completed",
  "cancelled",
  "reassigned",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export function isAssignmentStatus(value: string): value is AssignmentStatus {
  return (ASSIGNMENT_STATUSES as readonly string[]).includes(value);
}

export type WorkItemRecord = {
  id: number;
  organisation_id: number;

  title: string;
  description: string | null;
  expected_output: string | null;

  status: string;
  progress: number;

  due_at: string | null;

  created_by: number;
  created_at: string;
  updated_at: string;
};

export type WorkAssignmentRecord = {
  id: number;
  work_item_id: number;

  assigned_by: number;
  assignee_profile_id: number;

  instructions: string | null;

  /** active | completed | cancelled | reassigned. */
  status: string;

  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 2: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors (this file has no dependents yet, so it should pass in isolation).

- [ ] **Step 3: Commit**

```bash
git add node/src/work/work.record.ts
git commit -m "feat(work): add work record types and status vocabulary"
```

---

### Task 3: `work.validation.ts` — input validators

**Files:**
- Create: `node/src/work/work.validation.ts`

**Interfaces:**
- Consumes: `FieldError`, `Validated<T>` from `../profile/profile.validation.js`; `isWorkStatus`, `WorkStatus` from `./work.record.js`.
- Produces: `validateWorkTitle(raw): Validated<string>`, `validateWorkDescription(raw): Validated<string | null>`, `validateExpectedOutput(raw): Validated<string | null>`, `validateInstructions(raw): Validated<string | null>`, `validateDueAt(raw): Validated<string | null>`, `validateWorkStatus(raw): Validated<WorkStatus>`, `validateProgress(raw): Validated<number>`, `validatePositiveId(raw, field): Validated<number>` — all consumed by `work.service.ts`.

- [ ] **Step 1: Write the file**

```ts
import type { FieldError, Validated } from "../profile/profile.validation.js";
import { isWorkStatus, type WorkStatus } from "./work.record.js";

export type { FieldError, Validated };

export const TITLE_MIN_LENGTH = 2;
export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 5000;
export const EXPECTED_OUTPUT_MAX_LENGTH = 5000;
export const INSTRUCTIONS_MAX_LENGTH = 2000;

export function validateWorkTitle(raw: unknown): Validated<string> {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");

  if (value.length < TITLE_MIN_LENGTH) {
    return {
      ok: false,
      errors: [{ field: "title", message: "Enter a title for this work." }],
    };
  }

  if (value.length > TITLE_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "title",
          message: `Titles cannot be longer than ${TITLE_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

function validateLongText(
  raw: unknown,
  field: string,
  maxLength: number,
): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > maxLength) {
    return {
      ok: false,
      errors: [{ field, message: `Keep this under ${maxLength} characters.` }],
    };
  }

  return { ok: true, value };
}

export function validateWorkDescription(raw: unknown): Validated<string | null> {
  return validateLongText(raw, "description", DESCRIPTION_MAX_LENGTH);
}

export function validateExpectedOutput(raw: unknown): Validated<string | null> {
  return validateLongText(raw, "expectedOutput", EXPECTED_OUTPUT_MAX_LENGTH);
}

export function validateInstructions(raw: unknown): Validated<string | null> {
  return validateLongText(raw, "instructions", INSTRUCTIONS_MAX_LENGTH);
}

export function validateDueAt(raw: unknown): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      errors: [{ field: "dueAt", message: "Enter a valid date." }],
    };
  }

  return { ok: true, value: date.toISOString() };
}

export function validateWorkStatus(raw: unknown): Validated<WorkStatus> {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!isWorkStatus(value)) {
    return {
      ok: false,
      errors: [{ field: "status", message: "Choose one of the listed statuses." }],
    };
  }

  return { ok: true, value };
}

export function validateProgress(raw: unknown): Validated<number> {
  const value = Number(raw);

  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return {
      ok: false,
      errors: [
        {
          field: "progress",
          message: "Progress must be a whole number from 0 to 100.",
        },
      ],
    };
  }

  return { ok: true, value };
}

/** organisationId and assigneeProfileId — both untrusted body values. */
export function validatePositiveId(
  raw: unknown,
  field: string,
): Validated<number> {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return {
      ok: false,
      errors: [{ field, message: "That value is not valid." }],
    };
  }

  return { ok: true, value };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add node/src/work/work.validation.ts
git commit -m "feat(work): add input validation for work fields"
```

---

### Task 4: `work.repository.ts` — database queries

**Files:**
- Create: `node/src/work/work.repository.ts`

**Interfaces:**
- Consumes: `db` from `../db/knex.js`; table names and record types from `./work.record.js`.
- Produces: `findWorkItemById(id)`, `updateWorkItem(id, patch)`, `listVisibleWorkItems(userId)`, `listAssignmentsForItem(workItemId)`, `findActiveAssignment(workItemId)`, `listActiveAssignments(workItemIds)`, `createWorkItemWithAssignment(input)`, `reassignWorkItem(input)` — all consumed by `work.service.ts`.

- [ ] **Step 1: Write the file**

```ts
import { db } from "../db/knex.js";
import {
  WORK_ASSIGNMENTS_TABLE,
  WORK_ITEMS_TABLE,
  type WorkAssignmentRecord,
  type WorkItemRecord,
} from "./work.record.js";

const ITEMS = WORK_ITEMS_TABLE;
const ASSIGNMENTS = WORK_ASSIGNMENTS_TABLE;

export function findWorkItemById(id: number) {
  return db<WorkItemRecord>(ITEMS).where({ id }).first();
}

export async function updateWorkItem(
  id: number,
  patch: Partial<
    Pick<
      WorkItemRecord,
      | "title"
      | "description"
      | "expected_output"
      | "due_at"
      | "status"
      | "progress"
    >
  >,
): Promise<WorkItemRecord> {
  const [row] = await db<WorkItemRecord>(ITEMS)
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() as unknown as string })
    .returning("*");

  if (!row) {
    throw new Error(`Work item ${id} disappeared during update.`);
  }

  return row;
}

/**
 * Every Work Item the person may see: one they created, one they are
 * currently or were previously assigned, or one they have ever assigned to
 * somebody else.
 */
export function listVisibleWorkItems(userId: number): Promise<WorkItemRecord[]> {
  return db<WorkItemRecord>(ITEMS)
    .where({ created_by: userId })
    .orWhereExists(
      db(ASSIGNMENTS)
        .whereRaw(`${ASSIGNMENTS}.work_item_id = ${ITEMS}.id`)
        .where((builder) =>
          builder
            .where(`${ASSIGNMENTS}.assignee_profile_id`, userId)
            .orWhere(`${ASSIGNMENTS}.assigned_by`, userId),
        ),
    )
    .orderBy("created_at", "desc");
}

export function listAssignmentsForItem(
  workItemId: number,
): Promise<WorkAssignmentRecord[]> {
  return db<WorkAssignmentRecord>(ASSIGNMENTS)
    .where({ work_item_id: workItemId })
    .orderBy("created_at", "desc");
}

/** The one row with status "active", if there is one — never more than one. */
export function findActiveAssignment(workItemId: number) {
  return db<WorkAssignmentRecord>(ASSIGNMENTS)
    .where({ work_item_id: workItemId, status: "active" })
    .first();
}

/** Active assignments for a set of Work Items, in one query. */
export async function listActiveAssignments(
  workItemIds: number[],
): Promise<Map<number, WorkAssignmentRecord>> {
  if (workItemIds.length === 0) {
    return new Map();
  }

  const rows = await db<WorkAssignmentRecord>(ASSIGNMENTS)
    .whereIn("work_item_id", workItemIds)
    .where({ status: "active" });

  return new Map(rows.map((row) => [row.work_item_id, row]));
}

/**
 * The Work Item and its first assignment are one fact, written together. If
 * the assignment insert fails, the item insert rolls back with it — there is
 * never a Work Item with nobody assigned.
 */
export async function createWorkItemWithAssignment(input: {
  organisationId: number;
  title: string;
  description: string | null;
  expectedOutput: string | null;
  dueAt: string | null;
  createdBy: number;
  assigneeProfileId: number;
}): Promise<{ workItem: WorkItemRecord; assignment: WorkAssignmentRecord }> {
  return db.transaction(async (trx) => {
    const [workItem] = await trx<WorkItemRecord>(ITEMS)
      .insert({
        organisation_id: input.organisationId,
        title: input.title,
        description: input.description,
        expected_output: input.expectedOutput,
        due_at: input.dueAt,
        created_by: input.createdBy,
      })
      .returning("*");

    if (!workItem) {
      throw new Error("The work item row was not returned after insert.");
    }

    const [assignment] = await trx<WorkAssignmentRecord>(ASSIGNMENTS)
      .insert({
        work_item_id: workItem.id,
        assigned_by: input.createdBy,
        assignee_profile_id: input.assigneeProfileId,
        status: "active",
      })
      .returning("*");

    if (!assignment) {
      throw new Error("The assignment row was not returned after insert.");
    }

    return { workItem, assignment };
  });
}

/**
 * Retires the current active assignment (if any) and opens a new one, in one
 * transaction. Assignment history is a chain of rows, never an overwritten
 * column: Manager -> John becomes "reassigned", Manager -> Mary becomes the
 * new "active" row, and both stay in the table forever.
 */
export async function reassignWorkItem(input: {
  workItemId: number;
  assignedBy: number;
  assigneeProfileId: number;
  instructions: string | null;
}): Promise<WorkAssignmentRecord> {
  return db.transaction(async (trx) => {
    await trx<WorkAssignmentRecord>(ASSIGNMENTS)
      .where({ work_item_id: input.workItemId, status: "active" })
      .update({
        status: "reassigned",
        updated_at: trx.fn.now() as unknown as string,
      });

    const [assignment] = await trx<WorkAssignmentRecord>(ASSIGNMENTS)
      .insert({
        work_item_id: input.workItemId,
        assigned_by: input.assignedBy,
        assignee_profile_id: input.assigneeProfileId,
        instructions: input.instructions,
        status: "active",
      })
      .returning("*");

    if (!assignment) {
      throw new Error("The assignment row was not returned after insert.");
    }

    return assignment;
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add node/src/work/work.repository.ts
git commit -m "feat(work): add work repository queries"
```

---

### Task 5: `work.service.ts` — business rules, authorization, transactions

**Files:**
- Create: `node/src/work/work.service.ts`

**Interfaces:**
- Consumes: `findMembership`, `findOrganisationById` from `../organisation/organisation.repository.js`; `OrganisationMemberRecord` from `../organisation/organisation.record.js`; everything from `./work.repository.js` and `./work.validation.js`; record types from `./work.record.js`.
- Produces: `WorkError` (class, with `.status`, `.errors`, static `.field(status, field, message)`), `createWorkItem(userId, input)`, `listWorkItems(userId)`, `getWorkItem(userId, workItemId)`, `updateWorkItem(userId, workItemId, input)`, `assignWorkItem(userId, workItemId, input)` — all consumed by `work.controller.ts`. Also exports types `CreateWorkInput`, `UpdateWorkInput`, `AssignWorkInput`, `PublicWorkItem`, `PublicAssignment`.

**Key business rule, spelled out (do not deviate):** Reassignment authority in W0 is **the creator of the Work Item, and only the creator** — not "any org admin," because an admin with no history on a given Work Item has no visibility into it either (see the visibility rule above), and granting a visibility-less actor the power to reassign would silently expand W0's visibility rule through the back door. This mirrors the Global Constraints note on visibility.

- [ ] **Step 1: Write the file**

```ts
import {
  findMembership,
  findOrganisationById,
} from "../organisation/organisation.repository.js";
import type { OrganisationMemberRecord } from "../organisation/organisation.record.js";
import type { WorkAssignmentRecord, WorkItemRecord } from "./work.record.js";
import {
  createWorkItemWithAssignment,
  findWorkItemById,
  listActiveAssignments,
  listAssignmentsForItem,
  listVisibleWorkItems,
  reassignWorkItem,
  updateWorkItem as updateWorkItemRow,
} from "./work.repository.js";
import {
  validateDueAt,
  validateExpectedOutput,
  validateInstructions,
  validatePositiveId,
  validateProgress,
  validateWorkDescription,
  validateWorkStatus,
  validateWorkTitle,
  type FieldError,
} from "./work.validation.js";

/**
 * Carries field-scoped messages so the browser can put each one under the
 * input that caused it instead of dumping a single banner.
 */
export class WorkError extends Error {
  status: number;
  errors: FieldError[];

  constructor(status: number, errors: FieldError[]) {
    super(errors[0]?.message ?? "Request failed.");
    this.status = status;
    this.errors = errors;
  }

  static field(status: number, field: string, message: string): WorkError {
    return new WorkError(status, [{ field, message }]);
  }
}

const notFound = () =>
  WorkError.field(404, "form", "That work item could not be found.");

const notAllowed = () =>
  WorkError.field(403, "form", "You are not allowed to perform this action.");

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

function publicWorkItem(record: WorkItemRecord) {
  return {
    id: record.id,
    organisationId: record.organisation_id,
    title: record.title,
    description: record.description,
    expectedOutput: record.expected_output,
    status: record.status,
    progress: record.progress,
    dueAt: record.due_at,
    createdBy: record.created_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function publicAssignment(record: WorkAssignmentRecord) {
  return {
    id: record.id,
    workItemId: record.work_item_id,
    assignedBy: record.assigned_by,
    assigneeProfileId: record.assignee_profile_id,
    instructions: record.instructions,
    status: record.status,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export type PublicWorkItem = ReturnType<typeof publicWorkItem>;
export type PublicAssignment = ReturnType<typeof publicAssignment>;

/* ------------------------------------------------------------------------
   Access
   --------------------------------------------------------------------- */

/**
 * The caller's membership in an organisation named directly in the request —
 * used only where the organisation itself is the thing being addressed
 * (creating a Work Item). Every other Work operation below is item-centric:
 * see `requireVisibleItem`, which never distinguishes "no such organisation"
 * from "not your Work Item".
 */
async function requireOrganisationMembership(
  userId: number,
  organisationId: number,
): Promise<OrganisationMemberRecord> {
  const organisation = await findOrganisationById(organisationId);
  const membership = organisation
    ? await findMembership(organisationId, userId)
    : undefined;

  if (!organisation || !membership) {
    throw WorkError.field(404, "form", "That organisation could not be found.");
  }

  if (membership.status !== "active") {
    throw notAllowed();
  }

  return membership;
}

/** An assignee must be a real, active member of the same organisation. */
async function requireAssigneeEligible(
  organisationId: number,
  assigneeProfileId: number,
): Promise<void> {
  const membership = await findMembership(organisationId, assigneeProfileId);

  if (!membership || membership.status !== "active") {
    throw WorkError.field(
      422,
      "assigneeProfileId",
      "That person is not an active member of this organisation.",
    );
  }
}

function canView(
  userId: number,
  workItem: WorkItemRecord,
  assignments: WorkAssignmentRecord[],
): boolean {
  return (
    workItem.created_by === userId ||
    assignments.some(
      (row) => row.assignee_profile_id === userId || row.assigned_by === userId,
    )
  );
}

/**
 * Loads a Work Item with its full assignment history and checks visibility
 * in one place, since every read and write below needs exactly this. An
 * item outside the caller's visibility is reported as not found — never as
 * forbidden — so its existence is never revealed to somebody uninvolved.
 */
async function requireVisibleItem(
  userId: number,
  workItemId: number,
): Promise<{ workItem: WorkItemRecord; assignments: WorkAssignmentRecord[] }> {
  const workItem = await findWorkItemById(workItemId);

  if (!workItem) {
    throw notFound();
  }

  const assignments = await listAssignmentsForItem(workItemId);

  if (!canView(userId, workItem, assignments)) {
    throw notFound();
  }

  return { workItem, assignments };
}

/* ------------------------------------------------------------------------
   Create
   --------------------------------------------------------------------- */

export type CreateWorkInput = {
  organisationId?: unknown;
  title?: unknown;
  description?: unknown;
  expectedOutput?: unknown;
  dueAt?: unknown;
  assigneeProfileId?: unknown;
};

export async function createWorkItem(userId: number, input: CreateWorkInput) {
  const organisationId = validatePositiveId(input.organisationId, "organisationId");
  const title = validateWorkTitle(input.title);
  const description = validateWorkDescription(input.description);
  const expectedOutput = validateExpectedOutput(input.expectedOutput);
  const dueAt = validateDueAt(input.dueAt);
  const assigneeProfileId = validatePositiveId(
    input.assigneeProfileId,
    "assigneeProfileId",
  );

  const errors: FieldError[] = [
    organisationId,
    title,
    description,
    expectedOutput,
    dueAt,
    assigneeProfileId,
  ].flatMap((result) => (result.ok ? [] : result.errors));

  if (
    !organisationId.ok ||
    !title.ok ||
    !description.ok ||
    !expectedOutput.ok ||
    !dueAt.ok ||
    !assigneeProfileId.ok
  ) {
    throw new WorkError(422, errors);
  }

  // Never trust the caller for who they are — the creator is always the
  // authenticated user, resolved from the bearer token, never the body.
  await requireOrganisationMembership(userId, organisationId.value);
  await requireAssigneeEligible(organisationId.value, assigneeProfileId.value);

  const { workItem, assignment } = await createWorkItemWithAssignment({
    organisationId: organisationId.value,
    title: title.value,
    description: description.value,
    expectedOutput: expectedOutput.value,
    dueAt: dueAt.value,
    createdBy: userId,
    assigneeProfileId: assigneeProfileId.value,
  });

  return {
    message: `${workItem.title} has been created.`,
    workItem: publicWorkItem(workItem),
    assignment: publicAssignment(assignment),
  };
}

/* ------------------------------------------------------------------------
   Read
   --------------------------------------------------------------------- */

export async function listWorkItems(userId: number) {
  const rows = await listVisibleWorkItems(userId);
  const activeByItem = await listActiveAssignments(rows.map((row) => row.id));

  return {
    workItems: rows.map((row) => ({
      ...publicWorkItem(row),
      activeAssignment: activeByItem.has(row.id)
        ? publicAssignment(activeByItem.get(row.id)!)
        : null,
    })),
  };
}

export async function getWorkItem(userId: number, workItemId: number) {
  const { workItem, assignments } = await requireVisibleItem(userId, workItemId);
  const active = assignments.find((row) => row.status === "active") ?? null;

  return {
    workItem: publicWorkItem(workItem),
    activeAssignment: active ? publicAssignment(active) : null,
    assignmentHistory: assignments.map(publicAssignment),
  };
}

/* ------------------------------------------------------------------------
   Update
   --------------------------------------------------------------------- */

export type UpdateWorkInput = {
  title?: unknown;
  description?: unknown;
  expectedOutput?: unknown;
  dueAt?: unknown;
  status?: unknown;
  progress?: unknown;
};

export async function updateWorkItem(
  userId: number,
  workItemId: number,
  input: UpdateWorkInput,
) {
  const { workItem, assignments } = await requireVisibleItem(userId, workItemId);
  const active = assignments.find((row) => row.status === "active");

  // W0 has no hierarchy: the two people who may edit a Work Item are the
  // one who created it and the one it is currently assigned to.
  const canEdit =
    workItem.created_by === userId ||
    (active !== undefined && active.assignee_profile_id === userId);

  if (!canEdit) {
    throw notAllowed();
  }

  const title =
    input.title === undefined
      ? { ok: true as const, value: workItem.title }
      : validateWorkTitle(input.title);

  const description =
    input.description === undefined
      ? { ok: true as const, value: workItem.description }
      : validateWorkDescription(input.description);

  const expectedOutput =
    input.expectedOutput === undefined
      ? { ok: true as const, value: workItem.expected_output }
      : validateExpectedOutput(input.expectedOutput);

  const dueAt =
    input.dueAt === undefined
      ? { ok: true as const, value: workItem.due_at }
      : validateDueAt(input.dueAt);

  const status =
    input.status === undefined
      ? { ok: true as const, value: workItem.status }
      : validateWorkStatus(input.status);

  const progress =
    input.progress === undefined
      ? { ok: true as const, value: workItem.progress }
      : validateProgress(input.progress);

  const errors: FieldError[] = [
    title,
    description,
    expectedOutput,
    dueAt,
    status,
    progress,
  ].flatMap((result) => (result.ok ? [] : result.errors));

  if (
    !title.ok ||
    !description.ok ||
    !expectedOutput.ok ||
    !dueAt.ok ||
    !status.ok ||
    !progress.ok
  ) {
    throw new WorkError(422, errors);
  }

  // "done" and 100% progress are the same idea seen from two directions.
  // Whichever one the caller did not explicitly set in this request is
  // brought into line with the one they did, so the pair is never left
  // contradicting itself. If the caller explicitly sets both to
  // conflicting values in the same request, that explicit choice is kept
  // as-is — W0 normalizes defaults, it does not run a workflow engine.
  let finalStatus = status.value;
  let finalProgress = progress.value;

  if (
    input.status !== undefined &&
    finalStatus === "done" &&
    input.progress === undefined
  ) {
    finalProgress = 100;
  } else if (
    input.progress !== undefined &&
    finalProgress === 100 &&
    input.status === undefined
  ) {
    finalStatus = "done";
  }

  const updated = await updateWorkItemRow(workItem.id, {
    title: title.value,
    description: description.value,
    expected_output: expectedOutput.value,
    due_at: dueAt.value,
    status: finalStatus,
    progress: finalProgress,
  });

  return {
    message: "This work item has been updated.",
    workItem: publicWorkItem(updated),
  };
}

/* ------------------------------------------------------------------------
   Assign / reassign
   --------------------------------------------------------------------- */

export type AssignWorkInput = {
  assigneeProfileId?: unknown;
  instructions?: unknown;
};

export async function assignWorkItem(
  userId: number,
  workItemId: number,
  input: AssignWorkInput,
) {
  const { workItem } = await requireVisibleItem(userId, workItemId);

  // Reassignment authority is the creator, and only the creator — see the
  // note at the top of this file on why an org-admin override is
  // deliberately not included in W0.
  if (workItem.created_by !== userId) {
    throw notAllowed();
  }

  const membership = await findMembership(workItem.organisation_id, userId);

  if (!membership || membership.status !== "active") {
    throw notAllowed();
  }

  const assigneeProfileId = validatePositiveId(
    input.assigneeProfileId,
    "assigneeProfileId",
  );
  const instructions = validateInstructions(input.instructions);

  const errors: FieldError[] = [assigneeProfileId, instructions].flatMap(
    (result) => (result.ok ? [] : result.errors),
  );

  if (!assigneeProfileId.ok || !instructions.ok) {
    throw new WorkError(422, errors);
  }

  await requireAssigneeEligible(workItem.organisation_id, assigneeProfileId.value);

  const assignment = await reassignWorkItem({
    workItemId: workItem.id,
    assignedBy: userId,
    assigneeProfileId: assigneeProfileId.value,
    instructions: instructions.value,
  });

  return {
    message: "This work item has been reassigned.",
    assignment: publicAssignment(assignment),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add node/src/work/work.service.ts
git commit -m "feat(work): add work service with authorization and transactions"
```

---

### Task 6: `work.controller.ts`, `work.routes.ts`, mount in `app.ts`

**Files:**
- Create: `node/src/work/work.controller.ts`
- Create: `node/src/work/work.routes.ts`
- Modify: `node/src/app.ts`

**Interfaces:**
- Consumes: `currentUserId` from `../middleware/require-auth.js`; everything exported from `./work.service.js`; `requireAuth` from `../middleware/require-auth.js`.
- Produces: mounted routes `GET/POST /api/work`, `GET/PATCH /api/work/:id`, `POST /api/work/:id/assign`.

- [ ] **Step 1: Write `work.controller.ts`**

```ts
import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import {
  WorkError,
  assignWorkItem,
  createWorkItem,
  getWorkItem,
  listWorkItems,
  updateWorkItem,
} from "./work.service.js";

/**
 * One place where a thrown error becomes a response. Anything that is not a
 * deliberate `WorkError` is logged and answered with a generic message, so
 * database details never reach the browser.
 */
function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof WorkError) {
    res.status(error.status).json({
      message: error.message,
      errors: error.errors,
    });
    return;
  }

  console.error(`${context}:`, error);

  res.status(500).json({
    message: "Something went wrong. Please try again.",
    errors: [],
  });
}

/** Route parameters are untrusted text until proven otherwise. */
function readId(raw: unknown): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw WorkError.field(404, "form", "That work item could not be found.");
  }

  return value;
}

export async function index(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json(await listWorkItems(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to list work items");
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const result = await createWorkItem(currentUserId(req), req.body ?? {});
    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create a work item");
  }
}

export async function show(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id);
    res.status(200).json(await getWorkItem(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to load a work item");
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id);
    res
      .status(200)
      .json(await updateWorkItem(currentUserId(req), id, req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to update a work item");
  }
}

export async function assign(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id);
    res
      .status(200)
      .json(await assignWorkItem(currentUserId(req), id, req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to assign a work item");
  }
}
```

- [ ] **Step 2: Write `work.routes.ts`**

```ts
import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import { assign, create, index, show, update } from "./work.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

router.get("/", index);
router.post("/", create);

router.get("/:id", show);
router.patch("/:id", update);

router.post("/:id/assign", assign);

export default router;
```

- [ ] **Step 3: Mount the routes in `app.ts`**

In `node/src/app.ts`, add the import next to the other route imports:

```ts
import workRoutes from "./work/work.routes.js";
```

And mount it next to the other `/api/*` mounts:

```ts
app.use("/api/work", workRoutes);
```

The full mount block should read:

```ts
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/organisations", organisationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/work", workRoutes);
app.use("/api/reference", referenceRoutes);
```

- [ ] **Step 4: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors. This is the first point the whole module — record, validation, repository, service, controller, routes, and the `app.ts` wiring — compiles together.

- [ ] **Step 5: Start the dev server and smoke-test manually**

Run: `cd node && npm run dev`
Expected: server starts on port 5000 with no errors. In another terminal, `curl -i http://localhost:5000/api/work` should return `401 {"message":"You are not signed in."}` (proving `requireAuth` is wired correctly on the new router). Stop the dev server after confirming this (it will be restarted for Task 8).

- [ ] **Step 6: Commit**

```bash
git add node/src/work/work.controller.ts node/src/work/work.routes.ts node/src/app.ts
git commit -m "feat(work): mount /api/work routes"
```

---

### Task 7: End-to-end check script — `check-work-api.ts`

**Files:**
- Create: `node/scripts/check-work-api.ts`
- Modify: `node/package.json` (add `"check:work"` script)

**Interfaces:**
- Consumes: the running dev server at `http://localhost:5000`, `db` from `../src/db/knex.js` for setup/teardown/DB-level assertions.
- Produces: a `check:work` npm script that runs the same PASS/FAIL/teardown pattern as `check:org`, covering all 13 points from the original spec's testing section.

- [ ] **Step 1: Write the script**

```ts
import { db } from "../src/db/knex.js";

/**
 * End-to-end check of the Work (W0) area, in the style of
 * check-organisation-api.ts: it drives the running API over HTTP with
 * throwaway accounts and organisations, and removes everything it created.
 *
 * Start the API first:  npm run dev
 */

const API = "http://localhost:5000";
let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) failures += 1;
  console.log(
    `${condition ? "PASS" : "FAIL"}  ${label}${
      condition ? "" : `  -> ${JSON.stringify(detail)}`
    }`,
  );
}

async function call(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, options);
  const body = await res.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: body as any };
}

function json(
  method: string,
  token: string | null,
  payload?: unknown,
): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  };
}

async function makeUser(fullName: string, email: string) {
  const reg = await call(
    "/api/auth/register",
    json("POST", null, {
      fullName,
      email,
      password: "password123",
      confirmPassword: "password123",
    }),
  );

  const id = reg.body.user.id as number;
  const row = await db("profiles").where({ id }).first();

  const verified = await call(
    "/api/auth/verify",
    json("POST", null, { userId: id, otp: row.verification_otp }),
  );

  return { id, email, token: verified.body.token as string };
}

async function addActiveMember(
  organisationId: number,
  adminToken: string,
  person: { id: number; email: string; token: string },
) {
  const invite = await call(
    `/api/organisations/${organisationId}/invitations`,
    json("POST", adminToken, { person: person.email }),
  );

  const invitationId = invite.body.invitation?.id as number;

  await call(
    `/api/organisations/invitations/${invitationId}/accept`,
    json("POST", person.token),
  );
}

const stamp = Date.now();

const founder = await makeUser("Work Founder", `work-founder${stamp}@example.com`);
const john = await makeUser("Work John", `work-john${stamp}@example.com`);
const mary = await makeUser("Work Mary", `work-mary${stamp}@example.com`);
const outsider = await makeUser("Work Outsider", `work-outsider${stamp}@example.com`);

/* ------------------------------------------------------------- fixtures */

let r = await call(
  "/api/organisations",
  json("POST", founder.token, { name: `Work Org A ${stamp}`, type: "company" }),
);
const orgA = r.body.organisation?.id as number;

r = await call(
  "/api/organisations",
  json("POST", outsider.token, { name: `Work Org B ${stamp}`, type: "company" }),
);
const orgB = r.body.organisation?.id as number;

await addActiveMember(orgA, founder.token, john);
await addActiveMember(orgA, founder.token, mary);

/* ---------------------------------------------------------------- access */

r = await call("/api/work");
check("unauthenticated list is refused", r.status === 401, r.status);

/* ---------------------------------------------------------------- create */

r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgA,
    title: `Draft the report ${stamp}`,
    description: "Pull the numbers together.",
    expectedOutput: "A PDF.",
    assigneeProfileId: john.id,
  }),
);
check("an active member can create work", r.status === 201, r.body);

const workItemId = r.body.workItem?.id as number;

check(
  "the initial assignment is active and points at John",
  r.body.assignment?.status === "active" &&
    r.body.assignment?.assigneeProfileId === john.id,
  r.body.assignment,
);

r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgB,
    title: "Should never exist",
    assigneeProfileId: john.id,
  }),
);
check(
  "a non-member cannot create work for another organisation",
  r.status === 404,
  r.body,
);

const orphanTitle = `Orphan attempt ${stamp}`;

r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgA,
    title: orphanTitle,
    assigneeProfileId: outsider.id,
  }),
);
check(
  "work cannot be assigned to somebody outside the organisation",
  r.status === 422 && r.body.errors?.[0]?.field === "assigneeProfileId",
  r.body,
);

check(
  "the rejected assignment left no orphan work item",
  (await db("work_items").where({ title: orphanTitle }).first()) === undefined,
  orphanTitle,
);

/* ------------------------------------------------------------ visibility */

r = await call(`/api/work/${workItemId}`, json("GET", john.token));
check("the assignee can retrieve their work", r.status === 200, r.status);

r = await call(`/api/work/${workItemId}`, json("GET", founder.token));
check("the creator can retrieve work they assigned", r.status === 200, r.status);

r = await call(`/api/work/${workItemId}`, json("GET", outsider.token));
check(
  "an unrelated organisation member is told it does not exist",
  r.status === 404,
  r.status,
);

/* ------------------------------------------------------------ progress */

r = await call(
  `/api/work/${workItemId}`,
  json("PATCH", founder.token, { progress: 150 }),
);
check(
  "progress outside 0-100 is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "progress",
  r.body,
);

r = await call(
  `/api/work/${workItemId}`,
  json("PATCH", founder.token, { progress: 50 }),
);
check(
  "progress accepts a valid value",
  r.status === 200 && r.body.workItem?.progress === 50,
  r.body,
);

/* -------------------------------------------------------------- status */

r = await call(
  `/api/work/${workItemId}`,
  json("PATCH", founder.token, { status: "somewhere-in-between" }),
);
check(
  "an invalid status is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "status",
  r.body,
);

r = await call(
  `/api/work/${workItemId}`,
  json("PATCH", founder.token, { status: "done" }),
);
check(
  "moving to done also completes the progress",
  r.status === 200 &&
    r.body.workItem?.status === "done" &&
    r.body.workItem?.progress === 100,
  r.body,
);

/* --------------------------------------------------------- reassignment */

r = await call(
  `/api/work/${workItemId}/assign`,
  json("POST", founder.token, { assigneeProfileId: mary.id }),
);
check("the creator can reassign", r.status === 200, r.body);

r = await call(`/api/work/${workItemId}`, json("GET", founder.token));
check(
  "the active assignment now points at Mary",
  r.body.activeAssignment?.assigneeProfileId === mary.id,
  r.body.activeAssignment,
);

check(
  "John's assignment is preserved in history, not deleted",
  r.body.assignmentHistory?.length === 2 &&
    r.body.assignmentHistory.some(
      (a: { assigneeProfileId: number; status: string }) =>
        a.assigneeProfileId === john.id && a.status === "reassigned",
    ),
  r.body.assignmentHistory,
);

const activeRows = await db("work_assignments").where({
  work_item_id: workItemId,
  status: "active",
});
check(
  "only one assignment is active at a time",
  activeRows.length === 1,
  activeRows.length,
);

r = await call(
  `/api/work/${workItemId}/assign`,
  json("POST", john.token, { assigneeProfileId: mary.id }),
);
check(
  "a past assignee with no authority cannot reassign",
  r.status === 403,
  r.body,
);

r = await call(
  `/api/work/${workItemId}/assign`,
  json("POST", founder.token, { assigneeProfileId: outsider.id }),
);
check(
  "reassigning to somebody outside the organisation is rejected",
  r.status === 422,
  r.body,
);

r = await call(`/api/work/${workItemId}`, json("GET", founder.token));
check(
  "a failed reassignment left the active assignment untouched",
  r.body.activeAssignment?.assigneeProfileId === mary.id,
  r.body.activeAssignment,
);

/* ------------------------------------------------------------- teardown */

await db("work_items").where({ id: workItemId }).delete();
await db("organisations").whereIn("id", [orgA, orgB]).delete();
await db("profiles")
  .whereIn("id", [founder.id, john.id, mary.id, outsider.id])
  .delete();

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Add the npm script**

In `node/package.json`, add `"check:work"` next to `"check:org"`:

```json
    "check:api": "tsx scripts/check-profile-api.ts",
    "check:org": "tsx scripts/check-organisation-api.ts",
    "check:work": "tsx scripts/check-work-api.ts",
```

- [ ] **Step 3: Typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add node/scripts/check-work-api.ts node/package.json
git commit -m "test(work): add end-to-end check script for the Work API"
```

---

### Task 8: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Confirm the migration is applied**

Run: `cd node && npm run db:migrate`
Expected: either `008_create_work.ts` runs here if Task 1's Step 2 was skipped earlier, or `Already up to date` if it already ran.

- [ ] **Step 2: Full typecheck**

Run: `cd node && npm run typecheck`
Expected: no errors across the whole backend, not just the Work module.

- [ ] **Step 3: Start the dev server**

Run: `cd node && npm run dev` (leave running)
Expected: starts cleanly on port 5000, no errors in the console.

- [ ] **Step 4: Run the existing Organisation check to confirm no regression**

Run (new terminal): `cd node && npm run check:org`
Expected: `ALL CHECKS PASSED`. This proves the Work module did not disturb existing organisation behaviour (no shared file was changed except the additive lines in `app.ts` and `package.json`).

- [ ] **Step 5: Run the new Work check**

Run: `cd node && npm run check:work`
Expected: `ALL CHECKS PASSED`, covering all 13 points from the original spec's testing section: authenticated create, unauthenticated rejection, cross-organisation create rejection, cross-organisation assignment rejection, assignee retrieval, creator retrieval, unrelated-member rejection, progress bounds, invalid status rejection, reassignment history preservation, single-active-assignment invariant, unauthorized reassignment rejection, and no orphaned rows on failure.

- [ ] **Step 6: Review the full diff**

Run: `git diff main --stat` (or `git status` plus `git diff` per file)
Expected: only these files touched — `node/src/db/migrations/008_create_work.ts`, `node/src/work/*.ts` (six files), `node/src/app.ts`, `node/scripts/check-work-api.ts`, `node/package.json`, and this plan file under `docs/superpowers/plans/`. Nothing under `web/`, no changes to `organisation/`, `auth/`, `profile/`, or `notifications/` source files.

- [ ] **Step 7: Stop here**

Do not begin W1 (projects, hierarchy visibility, notifications for Work, etc.). Report back using the structure the original spec requested: what was implemented, tables/migration added, endpoints added, authorization rules, tests performed, any issues found, and the next recommended step — then wait for that next phase to be discussed separately.
