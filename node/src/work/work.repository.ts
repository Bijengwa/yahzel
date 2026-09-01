import { db } from "../db/knex.js";
import {
  WORK_ASSIGNMENTS_TABLE,
  WORK_ITEMS_TABLE,
  WORK_REPORTS_TABLE,
  WORK_REPORT_ATTACHMENTS_TABLE,
  type WorkAssignmentRecord,
  type WorkItemRecord,
  type WorkReportAttachmentRecord,
  type WorkReportRecord,
} from "./work.record.js";

const ITEMS = WORK_ITEMS_TABLE;
const ASSIGNMENTS = WORK_ASSIGNMENTS_TABLE;
const REPORTS = WORK_REPORTS_TABLE;
const ATTACHMENTS = WORK_REPORT_ATTACHMENTS_TABLE;

const now = () => db.fn.now() as unknown as string;

export function findWorkItemById(id: number) {
  return db<WorkItemRecord>(ITEMS).where({ id }).first();
}

/**
 * The editable business fields plus the activity timestamps. The service
 * decides which timestamps to move; the repository just writes what it is
 * given and always advances updated_at.
 */
type WorkItemPatch = Partial<
  Pick<
    WorkItemRecord,
    | "title"
    | "description"
    | "expected_output"
    | "due_at"
    | "status"
    | "progress"
    | "project_id"
    | "parent_id"
    | "department_id"
    | "last_activity_at"
    | "last_progress_at"
    | "last_report_at"
  >
>;

export async function updateWorkItem(
  id: number,
  patch: WorkItemPatch,
): Promise<WorkItemRecord> {
  const [row] = await db<WorkItemRecord>(ITEMS)
    .where({ id })
    .update({ ...patch, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Work item ${id} disappeared during update.`);
  }

  return row;
}

/**
 * Advances a Work Item's activity clock. last_activity_at always moves;
 * last_progress_at moves only when progress genuinely changed; last_report_at
 * moves only on report activity. Kept as its own helper so every write path can
 * bump the clock without repeating the timestamp bookkeeping.
 */
export async function bumpWorkActivity(
  id: number,
  options: { progress?: boolean; report?: boolean } = {},
): Promise<WorkItemRecord> {
  const patch: WorkItemPatch = { last_activity_at: now() };

  if (options.progress) {
    patch.last_progress_at = now();
  }

  if (options.report) {
    patch.last_report_at = now();
  }

  return updateWorkItem(id, patch);
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

/** Direct children of a Work Item, scoped to the same organisation. */
export function listChildWorkItems(
  parentId: number,
  organisationId: number,
): Promise<WorkItemRecord[]> {
  return db<WorkItemRecord>(ITEMS)
    .where({ parent_id: parentId, organisation_id: organisationId })
    .orderBy("created_at", "asc");
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
  projectId: number | null;
  parentId: number | null;
  departmentId: number | null;
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
        project_id: input.projectId,
        parent_id: input.parentId,
        department_id: input.departmentId,
        last_activity_at: trx.fn.now() as unknown as string,
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

/* ------------------------------------------------------------------------
   Reports
   --------------------------------------------------------------------- */

export function findReportById(id: number) {
  return db<WorkReportRecord>(REPORTS).where({ id }).first();
}

/** Every report for a Work Item, oldest first — the full preserved history. */
export function listReportsForItem(
  workItemId: number,
): Promise<WorkReportRecord[]> {
  return db<WorkReportRecord>(REPORTS)
    .where({ work_item_id: workItemId })
    .orderBy("created_at", "asc");
}

/**
 * The one non-terminal (draft or submitted) report for a Work Item, if any.
 * The partial unique index guarantees there is never more than one.
 */
export function findOpenReport(workItemId: number) {
  return db<WorkReportRecord>(REPORTS)
    .where({ work_item_id: workItemId })
    .whereIn("state", ["draft", "submitted"])
    .first();
}

export async function insertReport(input: {
  workItemId: number;
  organisationId: number;
  authorProfileId: number;
  body: string;
  state: string;
  submittedAt: string | null;
}): Promise<WorkReportRecord> {
  const [row] = await db<WorkReportRecord>(REPORTS)
    .insert({
      work_item_id: input.workItemId,
      organisation_id: input.organisationId,
      author_profile_id: input.authorProfileId,
      body: input.body,
      state: input.state,
      submitted_at: input.submittedAt,
    })
    .returning("*");

  if (!row) {
    throw new Error("The report row was not returned after insert.");
  }

  return row;
}

export async function updateReportBody(
  id: number,
  body: string,
): Promise<WorkReportRecord> {
  const [row] = await db<WorkReportRecord>(REPORTS)
    .where({ id })
    .update({ body, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Report ${id} disappeared during update.`);
  }

  return row;
}

/**
 * Moves a report to a new state, recording the moment and (for a decision) who
 * decided and why. A submission sets submitted_at; an accept/return sets
 * reviewed_by/reviewed_at and, for a return, decision_reason.
 */
export async function transitionReport(
  id: number,
  patch: {
    state: string;
    submittedAt?: string | null;
    reviewedByProfileId?: number | null;
    reviewedAt?: string | null;
    decisionReason?: string | null;
  },
): Promise<WorkReportRecord> {
  const update: Partial<WorkReportRecord> = {
    state: patch.state,
    updated_at: now(),
  };

  if (patch.submittedAt !== undefined) {
    update.submitted_at = patch.submittedAt;
  }

  if (patch.reviewedByProfileId !== undefined) {
    update.reviewed_by_profile_id = patch.reviewedByProfileId;
  }

  if (patch.reviewedAt !== undefined) {
    update.reviewed_at = patch.reviewedAt;
  }

  if (patch.decisionReason !== undefined) {
    update.decision_reason = patch.decisionReason;
  }

  const [row] = await db<WorkReportRecord>(REPORTS)
    .where({ id })
    .update(update)
    .returning("*");

  if (!row) {
    throw new Error(`Report ${id} disappeared during transition.`);
  }

  return row;
}

/* ------------------------------------------------------------------------
   Report attachments
   --------------------------------------------------------------------- */

export async function insertAttachment(input: {
  reportId: number;
  workItemId: number;
  organisationId: number;
  uploadedByProfileId: number;
  fileName: string;
  contentType: string;
  byteSize: number;
  storagePath: string;
}): Promise<WorkReportAttachmentRecord> {
  const [row] = await db<WorkReportAttachmentRecord>(ATTACHMENTS)
    .insert({
      report_id: input.reportId,
      work_item_id: input.workItemId,
      organisation_id: input.organisationId,
      uploaded_by_profile_id: input.uploadedByProfileId,
      file_name: input.fileName,
      content_type: input.contentType,
      byte_size: input.byteSize,
      storage_path: input.storagePath,
    })
    .returning("*");

  if (!row) {
    throw new Error("The attachment row was not returned after insert.");
  }

  return row;
}

export function listAttachmentsForReport(
  reportId: number,
): Promise<WorkReportAttachmentRecord[]> {
  return db<WorkReportAttachmentRecord>(ATTACHMENTS)
    .where({ report_id: reportId })
    .orderBy("created_at", "asc");
}

/** Attachments for many reports at once, grouped by report id. */
export async function listAttachmentsForReports(
  reportIds: number[],
): Promise<Map<number, WorkReportAttachmentRecord[]>> {
  const grouped = new Map<number, WorkReportAttachmentRecord[]>();

  if (reportIds.length === 0) {
    return grouped;
  }

  const rows = await db<WorkReportAttachmentRecord>(ATTACHMENTS)
    .whereIn("report_id", reportIds)
    .orderBy("created_at", "asc");

  for (const row of rows) {
    const bucket = grouped.get(row.report_id) ?? [];
    bucket.push(row);
    grouped.set(row.report_id, bucket);
  }

  return grouped;
}
