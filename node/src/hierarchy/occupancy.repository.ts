import type { Knex } from "knex";

import { db } from "../db/knex.js";
import {
  POSITION_OCCUPANCIES_TABLE,
  type PositionOccupancyRecord,
} from "./occupancy.record.js";

const OCCUPANCIES = POSITION_OCCUPANCIES_TABLE;

/**
 * Every write function here accepts an optional `queryable` so
 * occupancy.service's "replace" (end the current occupant, then insert the
 * new one) can run both writes inside one transaction — see
 * withOccupancyTransaction below. Reads default to the plain `db`
 * connection, exactly like every other repository in this codebase.
 */
type Queryable = Knex | Knex.Transaction;

/** The current (still open) occupancy of one position, if any. */
export function findActiveOccupancyByPosition(
  positionId: number,
  queryable: Queryable = db,
): Promise<PositionOccupancyRecord | undefined> {
  return queryable<PositionOccupancyRecord>(OCCUPANCIES)
    .where({ position_id: positionId, ends_at: null })
    .first();
}

/** The position, if any, this member currently occupies in this organisation. */
export function findActiveOccupancyByMember(
  organisationId: number,
  memberId: number,
  queryable: Queryable = db,
): Promise<PositionOccupancyRecord | undefined> {
  return queryable<PositionOccupancyRecord>(OCCUPANCIES)
    .where({
      organisation_id: organisationId,
      member_id: memberId,
      ends_at: null,
    })
    .first();
}

/** Every position's current occupant for one organisation, in one query. */
export function listActiveOccupancies(
  organisationId: number,
): Promise<PositionOccupancyRecord[]> {
  return db<PositionOccupancyRecord>(OCCUPANCIES).where({
    organisation_id: organisationId,
    ends_at: null,
  });
}

/** Every occupancy a position has ever had, newest first. */
export function listOccupancyHistoryByPosition(
  positionId: number,
): Promise<PositionOccupancyRecord[]> {
  return db<PositionOccupancyRecord>(OCCUPANCIES)
    .where({ position_id: positionId })
    .orderBy("starts_at", "desc");
}

/** Every position a member has ever occupied in this organisation, newest first. */
export function listOccupancyHistoryByMember(
  organisationId: number,
  memberId: number,
): Promise<PositionOccupancyRecord[]> {
  return db<PositionOccupancyRecord>(OCCUPANCIES)
    .where({ organisation_id: organisationId, member_id: memberId })
    .orderBy("starts_at", "desc");
}

export async function insertOccupancy(
  input: { organisationId: number; positionId: number; memberId: number },
  queryable: Queryable = db,
): Promise<PositionOccupancyRecord> {
  const [row] = await queryable<PositionOccupancyRecord>(OCCUPANCIES)
    .insert({
      organisation_id: input.organisationId,
      position_id: input.positionId,
      member_id: input.memberId,
      starts_at: db.fn.now() as unknown as string,
    })
    .returning("*");

  if (!row) {
    throw new Error("The occupancy row was not returned after insert.");
  }

  return row;
}

/** Sets `ends_at` on an open occupancy row. The row is kept, never deleted. */
export async function endOccupancyRow(
  id: number,
  queryable: Queryable = db,
): Promise<PositionOccupancyRecord> {
  const [row] = await queryable<PositionOccupancyRecord>(OCCUPANCIES)
    .where({ id })
    .update({
      ends_at: db.fn.now(),
      updated_at: db.fn.now(),
    } as unknown as Partial<PositionOccupancyRecord>)
    .returning("*");

  if (!row) {
    throw new Error(`Occupancy ${id} disappeared while ending it.`);
  }

  return row;
}

/**
 * Ends every open occupancy a member currently holds — sets `ends_at` on each
 * row where the member is still the active occupant. History is preserved: the
 * rows are kept, never deleted. Used when a membership is concluded so the
 * person no longer occupies any position. Transaction-aware so it can run in
 * the same transaction as the membership status change.
 */
export function endOpenOccupanciesForMember(
  memberId: number,
  queryable: Queryable = db,
): Promise<number> {
  return queryable<PositionOccupancyRecord>(OCCUPANCIES)
    .where({ member_id: memberId, ends_at: null })
    .update({
      ends_at: db.fn.now(),
      updated_at: db.fn.now(),
    } as unknown as Partial<PositionOccupancyRecord>);
}

/**
 * Runs an assign/replace/end operation in one transaction, so ending the
 * previous occupant and inserting the new one (a "replace") are committed
 * together — never left with one write applied and not the other.
 */
export function withOccupancyTransaction<T>(
  fn: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(fn);
}
