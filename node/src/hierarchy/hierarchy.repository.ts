import { db } from "../db/knex.js";
import { POSITIONS_TABLE, type PositionRecord } from "./hierarchy.record.js";

const POSITIONS = POSITIONS_TABLE;

export function listPositions(
  organisationId: number,
): Promise<PositionRecord[]> {
  return db<PositionRecord>(POSITIONS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "asc");
}

export function findPositionById(
  id: number,
): Promise<PositionRecord | undefined> {
  return db<PositionRecord>(POSITIONS).where({ id }).first();
}

export async function createPosition(input: {
  organisationId: number;
  name: string;
  parentPositionId: number | null;
}): Promise<PositionRecord> {
  const [row] = await db<PositionRecord>(POSITIONS)
    .insert({
      organisation_id: input.organisationId,
      name: input.name,
      parent_position_id: input.parentPositionId,
    })
    .returning("*");

  if (!row) {
    throw new Error("The position row was not returned after insert.");
  }

  return row;
}

export async function updatePosition(
  id: number,
  patch: Partial<Pick<PositionRecord, "name" | "parent_position_id">>,
): Promise<PositionRecord> {
  const [row] = await db<PositionRecord>(POSITIONS)
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() as unknown as string })
    .returning("*");

  if (!row) {
    throw new Error(`Position ${id} disappeared during update.`);
  }

  return row;
}

/**
 * A single-row delete. The self-referential foreign key (see migration 009)
 * cascades to every descendant, so a whole subtree is removed by deleting
 * its root — nothing here has to walk the tree to clean it up.
 */
export async function deletePosition(id: number): Promise<void> {
  await db<PositionRecord>(POSITIONS).where({ id }).delete();
}
