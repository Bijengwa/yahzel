import { db } from "../db/knex.js";
import {
  CONTRACT_EXPIRY_NOTICES_TABLE,
  WORK_CAPABILITIES_TABLE,
  WORK_SCHEDULES_TABLE,
  WORK_SCHEDULE_OCCURRENCES_TABLE,
  WORK_SETTINGS_TABLE,
  WORK_STALL_NOTICES_TABLE,
  type ContractExpiryNoticeRecord,
  type WorkCapabilityRecord,
  type WorkScheduleOccurrenceRecord,
  type WorkScheduleRecord,
  type WorkSettingsRecord,
  type WorkStallNoticeRecord,
} from "./obligation.record.js";
import {
  DEFAULT_CONTRACT_NOTICE_DAYS,
  DEFAULT_STALLED_BLOCKED_DAYS,
  DEFAULT_STALLED_INACTIVE_DAYS,
} from "./obligation.types.js";

const now = () => db.fn.now() as unknown as string;

/**
 * node-pg parses a `date` column into a JS `Date` built from LOCAL
 * calendar components (year/month/day), not a UTC instant — unlike every
 * other timestamp column in this app. Left as a `Date`, it would later
 * serialise via `JSON.stringify`'s `toISOString()` and silently shift to
 * the wrong calendar day in any non-UTC environment. `work_schedules` is
 * the only table with `date` columns (see migration 019), so every read of
 * one is normalised back to a plain "YYYY-MM-DD" string here, in one place.
 */
function toDateOnlyString(value: string | Date): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return value.slice(0, 10);
}

function normalizeSchedule(row: WorkScheduleRecord): WorkScheduleRecord {
  return {
    ...row,
    next_run_on: toDateOnlyString(row.next_run_on),
    last_generated_on:
      row.last_generated_on === null ? null : toDateOnlyString(row.last_generated_on),
  };
}

/* ------------------------------------------------------------------------
   Organisation work settings — one row per organisation, created on first
   use with the same defaults the migration gives the column.
   --------------------------------------------------------------------- */

export function findWorkSettings(
  organisationId: number,
): Promise<WorkSettingsRecord | undefined> {
  return db<WorkSettingsRecord>(WORK_SETTINGS_TABLE)
    .where({ organisation_id: organisationId })
    .first();
}

/** Gets the settings row, creating it with defaults if this is the first use. */
export async function ensureWorkSettings(
  organisationId: number,
): Promise<WorkSettingsRecord> {
  const existing = await findWorkSettings(organisationId);

  if (existing) {
    return existing;
  }

  const [row] = await db<WorkSettingsRecord>(WORK_SETTINGS_TABLE)
    .insert({
      organisation_id: organisationId,
      contract_notice_days: DEFAULT_CONTRACT_NOTICE_DAYS,
      stalled_inactive_days: DEFAULT_STALLED_INACTIVE_DAYS,
      stalled_blocked_days: DEFAULT_STALLED_BLOCKED_DAYS,
    })
    .onConflict("organisation_id")
    .merge({ updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error("Work settings row was not returned after insert.");
  }

  return row;
}

export async function updateWorkSettings(
  organisationId: number,
  patch: Partial<
    Pick<
      WorkSettingsRecord,
      "contract_notice_days" | "stalled_inactive_days" | "stalled_blocked_days"
    >
  >,
): Promise<WorkSettingsRecord> {
  await ensureWorkSettings(organisationId);

  const [row] = await db<WorkSettingsRecord>(WORK_SETTINGS_TABLE)
    .where({ organisation_id: organisationId })
    .update({ ...patch, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Work settings for organisation ${organisationId} disappeared during update.`);
  }

  return row;
}

/* ------------------------------------------------------------------------
   Work capabilities — organisation-scoped templates, built-in or custom.
   --------------------------------------------------------------------- */

export function listCapabilities(
  organisationId: number,
): Promise<WorkCapabilityRecord[]> {
  return db<WorkCapabilityRecord>(WORK_CAPABILITIES_TABLE)
    .where({ organisation_id: organisationId })
    .orderBy([{ column: "built_in", order: "desc" }, { column: "name", order: "asc" }]);
}

export function findCapabilityById(
  id: number,
): Promise<WorkCapabilityRecord | undefined> {
  return db<WorkCapabilityRecord>(WORK_CAPABILITIES_TABLE).where({ id }).first();
}

export function findCapabilityByKey(
  organisationId: number,
  key: string,
): Promise<WorkCapabilityRecord | undefined> {
  return db<WorkCapabilityRecord>(WORK_CAPABILITIES_TABLE)
    .where({ organisation_id: organisationId, key })
    .first();
}

export async function insertCapability(input: {
  organisationId: number;
  key: string;
  name: string;
  description: string | null;
  suggestedTitle: string;
  suggestedDescription: string | null;
  suggestedExpectedOutput: string | null;
  checklistJson: string | null;
  defaultAssigneeRule: string;
  cadence: string | null;
  evidenceExpectation: string | null;
  builtIn: boolean;
}): Promise<WorkCapabilityRecord> {
  const [row] = await db<WorkCapabilityRecord>(WORK_CAPABILITIES_TABLE)
    .insert({
      organisation_id: input.organisationId,
      key: input.key,
      name: input.name,
      description: input.description,
      suggested_title: input.suggestedTitle,
      suggested_description: input.suggestedDescription,
      suggested_expected_output: input.suggestedExpectedOutput,
      checklist_json: input.checklistJson,
      default_assignee_rule: input.defaultAssigneeRule,
      cadence: input.cadence,
      evidence_expectation: input.evidenceExpectation,
      built_in: input.builtIn,
    })
    .returning("*");

  if (!row) {
    throw new Error("The capability row was not returned after insert.");
  }

  return row;
}

export async function updateCapability(
  id: number,
  patch: Partial<
    Pick<
      WorkCapabilityRecord,
      | "name"
      | "description"
      | "suggested_title"
      | "suggested_description"
      | "suggested_expected_output"
      | "checklist_json"
      | "default_assignee_rule"
      | "cadence"
      | "evidence_expectation"
      | "active"
    >
  >,
): Promise<WorkCapabilityRecord> {
  const [row] = await db<WorkCapabilityRecord>(WORK_CAPABILITIES_TABLE)
    .where({ id })
    .update({ ...patch, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Capability ${id} disappeared during update.`);
  }

  return row;
}

/**
 * Idempotent: rows already present for this organisation (matched by key)
 * are left untouched, so an admin's edits to a built-in are never
 * clobbered by seeding running again.
 */
export async function seedBuiltInCapabilities(
  organisationId: number,
  capabilities: {
    key: string;
    name: string;
    description: string | null;
    suggestedTitle: string;
    suggestedDescription: string | null;
    suggestedExpectedOutput: string | null;
    evidenceExpectation: string | null;
    defaultAssigneeRule: string;
    cadence: string | null;
  }[],
): Promise<void> {
  if (capabilities.length === 0) {
    return;
  }

  await db<WorkCapabilityRecord>(WORK_CAPABILITIES_TABLE)
    .insert(
      capabilities.map((capability) => ({
        organisation_id: organisationId,
        key: capability.key,
        name: capability.name,
        description: capability.description,
        suggested_title: capability.suggestedTitle,
        suggested_description: capability.suggestedDescription,
        suggested_expected_output: capability.suggestedExpectedOutput,
        checklist_json: null,
        default_assignee_rule: capability.defaultAssigneeRule,
        cadence: capability.cadence,
        evidence_expectation: capability.evidenceExpectation,
        built_in: true,
      })),
    )
    .onConflict(["organisation_id", "key"])
    .ignore();
}

/* ------------------------------------------------------------------------
   Work schedules — a capability plus a cadence, generating occurrences.
   --------------------------------------------------------------------- */

export async function listSchedules(
  organisationId: number,
): Promise<WorkScheduleRecord[]> {
  const rows = await db<WorkScheduleRecord>(WORK_SCHEDULES_TABLE)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");

  return rows.map(normalizeSchedule);
}

export async function findScheduleById(
  id: number,
): Promise<WorkScheduleRecord | undefined> {
  const row = await db<WorkScheduleRecord>(WORK_SCHEDULES_TABLE).where({ id }).first();

  return row ? normalizeSchedule(row) : undefined;
}

export async function insertSchedule(input: {
  organisationId: number;
  capabilityId: number;
  cadence: string;
  nextRunOn: string;
  assigneeProfileId: number | null;
}): Promise<WorkScheduleRecord> {
  const [row] = await db<WorkScheduleRecord>(WORK_SCHEDULES_TABLE)
    .insert({
      organisation_id: input.organisationId,
      capability_id: input.capabilityId,
      cadence: input.cadence,
      next_run_on: input.nextRunOn,
      assignee_profile_id: input.assigneeProfileId,
    })
    .returning("*");

  if (!row) {
    throw new Error("The schedule row was not returned after insert.");
  }

  return normalizeSchedule(row);
}

export async function updateSchedule(
  id: number,
  patch: Partial<
    Pick<WorkScheduleRecord, "next_run_on" | "last_generated_on" | "active">
  >,
): Promise<WorkScheduleRecord> {
  const [row] = await db<WorkScheduleRecord>(WORK_SCHEDULES_TABLE)
    .where({ id })
    .update({ ...patch, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Schedule ${id} disappeared during update.`);
  }

  return normalizeSchedule(row);
}

/** Active schedules whose next run has come due, as of the given date. */
export async function listDueSchedules(
  organisationId: number,
  asOfDate: string,
): Promise<WorkScheduleRecord[]> {
  const rows = await db<WorkScheduleRecord>(WORK_SCHEDULES_TABLE)
    .where({ organisation_id: organisationId, active: true })
    .andWhere("next_run_on", "<=", asOfDate)
    .orderBy("next_run_on", "asc");

  return rows.map(normalizeSchedule);
}

/* ------------------------------------------------------------------------
   Occurrences — one row per (schedule, period), so generation is idempotent.
   --------------------------------------------------------------------- */

export function findOccurrence(
  scheduleId: number,
  occurrenceKey: string,
): Promise<WorkScheduleOccurrenceRecord | undefined> {
  return db<WorkScheduleOccurrenceRecord>(WORK_SCHEDULE_OCCURRENCES_TABLE)
    .where({ schedule_id: scheduleId, occurrence_key: occurrenceKey })
    .first();
}

/**
 * Inserts the occurrence row, silently doing nothing if one already exists
 * for this (schedule, period) — the unique index is the real guard; this
 * makes a duplicate call a no-op instead of an error.
 */
export async function insertOccurrenceIfAbsent(input: {
  organisationId: number;
  scheduleId: number;
  occurrenceKey: string;
  workItemId: number;
}): Promise<WorkScheduleOccurrenceRecord | undefined> {
  const [row] = await db<WorkScheduleOccurrenceRecord>(
    WORK_SCHEDULE_OCCURRENCES_TABLE,
  )
    .insert({
      organisation_id: input.organisationId,
      schedule_id: input.scheduleId,
      occurrence_key: input.occurrenceKey,
      work_item_id: input.workItemId,
    })
    .onConflict(["schedule_id", "occurrence_key"])
    .ignore()
    .returning("*");

  return row;
}

/* ------------------------------------------------------------------------
   Contract expiry notices — one per contract, forever; a renewed contract
   is a new row (Phase 3), so it earns its own eligibility to be notified.
   --------------------------------------------------------------------- */

export function findExpiryNotice(
  contractId: number,
): Promise<ContractExpiryNoticeRecord | undefined> {
  return db<ContractExpiryNoticeRecord>(CONTRACT_EXPIRY_NOTICES_TABLE)
    .where({ contract_id: contractId })
    .first();
}

export function listExpiryNoticesForOrganisation(
  organisationId: number,
): Promise<ContractExpiryNoticeRecord[]> {
  return db<ContractExpiryNoticeRecord>(CONTRACT_EXPIRY_NOTICES_TABLE).where({
    organisation_id: organisationId,
  });
}

export async function insertExpiryNoticeIfAbsent(input: {
  organisationId: number;
  contractId: number;
}): Promise<ContractExpiryNoticeRecord | undefined> {
  const [row] = await db<ContractExpiryNoticeRecord>(CONTRACT_EXPIRY_NOTICES_TABLE)
    .insert({
      organisation_id: input.organisationId,
      contract_id: input.contractId,
    })
    .onConflict("contract_id")
    .ignore()
    .returning("*");

  return row;
}

export async function attachWorkItemToExpiryNotice(
  contractId: number,
  workItemId: number,
): Promise<void> {
  await db<ContractExpiryNoticeRecord>(CONTRACT_EXPIRY_NOTICES_TABLE)
    .where({ contract_id: contractId })
    .update({ work_item_id: workItemId });
}

/* ------------------------------------------------------------------------
   Work stall notices — a diagnostic marker, not a person score. One row per
   work item; cleared when the item is no longer stalled so a later stall
   earns a fresh notification instead of being silently swallowed forever.
   --------------------------------------------------------------------- */

export function findStallNotice(
  workItemId: number,
): Promise<WorkStallNoticeRecord | undefined> {
  return db<WorkStallNoticeRecord>(WORK_STALL_NOTICES_TABLE)
    .where({ work_item_id: workItemId })
    .first();
}

export function listStallNoticesForOrganisation(
  organisationId: number,
): Promise<WorkStallNoticeRecord[]> {
  return db<WorkStallNoticeRecord>(WORK_STALL_NOTICES_TABLE).where({
    organisation_id: organisationId,
  });
}

export async function upsertStallNotice(input: {
  organisationId: number;
  workItemId: number;
  kind: string;
}): Promise<WorkStallNoticeRecord> {
  const [row] = await db<WorkStallNoticeRecord>(WORK_STALL_NOTICES_TABLE)
    .insert({
      organisation_id: input.organisationId,
      work_item_id: input.workItemId,
      kind: input.kind,
    })
    .onConflict("work_item_id")
    .merge({ kind: input.kind, notified_at: now() })
    .returning("*");

  if (!row) {
    throw new Error("The stall notice row was not returned after upsert.");
  }

  return row;
}

export async function clearStallNotice(workItemId: number): Promise<void> {
  await db<WorkStallNoticeRecord>(WORK_STALL_NOTICES_TABLE)
    .where({ work_item_id: workItemId })
    .delete();
}
