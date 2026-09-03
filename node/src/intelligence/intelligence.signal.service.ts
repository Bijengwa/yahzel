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
