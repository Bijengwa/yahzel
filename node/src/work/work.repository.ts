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
