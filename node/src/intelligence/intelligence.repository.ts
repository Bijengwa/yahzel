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
