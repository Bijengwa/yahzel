import {
  findMembership,
  findOrganisationById,
} from "../organisation/organisation.repository.js";
import type { OrganisationMemberRecord } from "../organisation/organisation.record.js";
import { findProjectById } from "../projects/project.repository.js";
import { findDepartmentById } from "../departments/department.repository.js";
import { createNotification } from "../notifications/notification.service.js";
import { clearStallNotice } from "./obligation.repository.js";
import type {
  WorkAssignmentRecord,
  WorkItemRecord,
  WorkReportAttachmentRecord,
  WorkReportRecord,
} from "./work.record.js";
import {
  bumpWorkActivity,
  createWorkItemWithAssignment,
  findReportById,
  findWorkItemById,
  insertAttachment,
  insertReport,
  listActiveAssignments,
  listAssignmentsForItem,
  listAttachmentsForReport,
  listAttachmentsForReports,
  listChildWorkItems,
  listReportsForItem,
  listVisibleWorkItems,
  findOpenReport,
  reassignWorkItem,
  transitionReport,
  updateReportBody,
  updateWorkItem as updateWorkItemRow,
} from "./work.repository.js";
import {
  isAcceptedAttachmentType,
  MAX_ATTACHMENT_BYTES,
  deleteAttachment,
  saveAttachment,
} from "./work.storage.js";
import {
  validateDecisionReason,
  validateDueAt,
  validateExpectedOutput,
  validateInstructions,
  validateOptionalBlockedReason,
  validateOptionalPositiveId,
  validatePositiveId,
  validateProgress,
  validateReportBody,
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

const notFoundReport = () =>
  WorkError.field(404, "form", "That report could not be found.");

const notAllowed = () =>
  WorkError.field(403, "form", "You are not allowed to perform this action.");

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

export function publicWorkItem(record: WorkItemRecord) {
  return {
    id: record.id,
    organisationId: record.organisation_id,
    title: record.title,
    description: record.description,
    expectedOutput: record.expected_output,
    status: record.status,
    progress: record.progress,
    dueAt: record.due_at,
    projectId: record.project_id,
    parentId: record.parent_id,
    departmentId: record.department_id,
    lastActivityAt: record.last_activity_at,
    lastProgressAt: record.last_progress_at,
    lastReportAt: record.last_report_at,
    blockedReason: record.blocked_reason,
    sourceCapabilityId: record.source_capability_id,
    sourceScheduleId: record.source_schedule_id,
    occurrenceKey: record.occurrence_key,
    contractId: record.contract_id,
    employmentRecordId: record.employment_record_id,
    createdBy: record.created_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function publicAssignment(record: WorkAssignmentRecord) {
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

function publicAttachment(record: WorkReportAttachmentRecord) {
  return {
    id: record.id,
    reportId: record.report_id,
    workItemId: record.work_item_id,
    uploadedByProfileId: record.uploaded_by_profile_id,
    fileName: record.file_name,
    contentType: record.content_type,
    byteSize: record.byte_size,
    url: record.storage_path,
    createdAt: record.created_at,
  };
}

function publicReport(
  record: WorkReportRecord,
  attachments: WorkReportAttachmentRecord[],
) {
  return {
    id: record.id,
    workItemId: record.work_item_id,
    organisationId: record.organisation_id,
    authorProfileId: record.author_profile_id,
    body: record.body,
    state: record.state,
    decisionReason: record.decision_reason,
    reviewedByProfileId: record.reviewed_by_profile_id,
    submittedAt: record.submitted_at,
    reviewedAt: record.reviewed_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    attachments: attachments.map(publicAttachment),
  };
}

export type PublicWorkItem = ReturnType<typeof publicWorkItem>;
export type PublicAssignment = ReturnType<typeof publicAssignment>;
export type PublicReport = ReturnType<typeof publicReport>;
export type PublicAttachment = ReturnType<typeof publicAttachment>;

/* ------------------------------------------------------------------------
   Access
   --------------------------------------------------------------------- */

export async function requireOrganisationMembership(
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

/** Whether a person is an active administrator of an organisation. */
async function isActiveAdmin(
  organisationId: number,
  userId: number,
): Promise<boolean> {
  const membership = await findMembership(organisationId, userId);

  return (
    membership !== undefined &&
    membership.status === "active" &&
    membership.system_role === "admin"
  );
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
 * in one place. An item outside the caller's visibility is reported as not
 * found — never as forbidden — so its existence is never revealed.
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

/** Loads a report with its Work Item, checking the caller may see the item. */
async function requireVisibleReport(
  userId: number,
  reportId: number,
): Promise<{
  report: WorkReportRecord;
  workItem: WorkItemRecord;
  assignments: WorkAssignmentRecord[];
}> {
  const report = await findReportById(reportId);

  if (!report) {
    throw notFoundReport();
  }

  const workItem = await findWorkItemById(report.work_item_id);

  if (!workItem) {
    throw notFoundReport();
  }

  const assignments = await listAssignmentsForItem(workItem.id);

  if (!canView(userId, workItem, assignments)) {
    throw notFoundReport();
  }

  return { report, workItem, assignments };
}

/**
 * The reviewer of a report is the Work Item's creator or an active admin of
 * its organisation — the two people who may accept or return work.
 */
async function requireReviewer(
  userId: number,
  workItem: WorkItemRecord,
): Promise<void> {
  if (workItem.created_by === userId) {
    return;
  }

  if (await isActiveAdmin(workItem.organisation_id, userId)) {
    return;
  }

  throw notAllowed();
}

/* ------------------------------------------------------------------------
   Same-organisation resolution of the optional Phase 2 links
   --------------------------------------------------------------------- */

async function resolveProject(
  organisationId: number,
  raw: unknown,
): Promise<number | null> {
  const projectId = validateOptionalPositiveId(raw, "projectId");

  if (!projectId.ok) {
    throw new WorkError(422, projectId.errors);
  }

  if (projectId.value === null) {
    return null;
  }

  const project = await findProjectById(projectId.value);

  if (!project || project.organisation_id !== organisationId) {
    throw WorkError.field(
      422,
      "projectId",
      "That project could not be found in this organisation.",
    );
  }

  return project.id;
}

async function resolveDepartment(
  organisationId: number,
  raw: unknown,
): Promise<number | null> {
  const departmentId = validateOptionalPositiveId(raw, "departmentId");

  if (!departmentId.ok) {
    throw new WorkError(422, departmentId.errors);
  }

  if (departmentId.value === null) {
    return null;
  }

  const department = await findDepartmentById(departmentId.value);

  if (!department || department.organisation_id !== organisationId) {
    throw WorkError.field(
      422,
      "departmentId",
      "That department could not be found in this organisation.",
    );
  }

  return department.id;
}

/**
 * Resolves an optional parent Work Item, enforcing one level of nesting: the
 * parent must be in the same organisation and must NOT itself be a child
 * (its own parent_id must be null). A child of a child is refused.
 */
async function resolveParent(
  organisationId: number,
  raw: unknown,
): Promise<number | null> {
  const parentId = validateOptionalPositiveId(raw, "parentId");

  if (!parentId.ok) {
    throw new WorkError(422, parentId.errors);
  }

  if (parentId.value === null) {
    return null;
  }

  const parent = await findWorkItemById(parentId.value);

  if (!parent || parent.organisation_id !== organisationId) {
    throw WorkError.field(
      422,
      "parentId",
      "That parent work item could not be found in this organisation.",
    );
  }

  if (parent.parent_id !== null) {
    throw WorkError.field(
      422,
      "parentId",
      "Work can only be nested one level deep — this item is already a child.",
    );
  }

  return parent.id;
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
  projectId?: unknown;
  parentId?: unknown;
  departmentId?: unknown;
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

  // Each optional link must belong to the same organisation; a parent must be
  // a top-level item (one level of nesting only).
  const projectId = await resolveProject(organisationId.value, input.projectId);
  const departmentId = await resolveDepartment(
    organisationId.value,
    input.departmentId,
  );
  const parentId = await resolveParent(organisationId.value, input.parentId);

  const { workItem, assignment } = await createWorkItemWithAssignment({
    organisationId: organisationId.value,
    title: title.value,
    description: description.value,
    expectedOutput: expectedOutput.value,
    dueAt: dueAt.value,
    projectId,
    departmentId,
    parentId,
    createdBy: userId,
    assigneeProfileId: assigneeProfileId.value,
  });

  // Being assigned work is worth a heads-up — unless you assigned it to
  // yourself, in which case you already know.
  if (assigneeProfileId.value !== userId) {
    await createNotification({
      recipientProfileId: assigneeProfileId.value,
      type: "work.assigned",
      message: `You have been assigned "${workItem.title}".`,
      organisationId: workItem.organisation_id,
      workItemId: workItem.id,
      actionUrl: `/work/${workItem.id}`,
    });
  }

  return {
    message: `${workItem.title} has been created.`,
    workItem: publicWorkItem(workItem),
    assignment: publicAssignment(assignment),
  };
}

/**
 * The one other door into the Work engine besides createWorkItem: used by
 * capability instantiation, schedule generation and contract-expiry review
 * work, where the title/description/assignee are already resolved
 * server-side (from a capability or a contract) rather than typed by a
 * person into the create form. It shares the exact same insert path —
 * createWorkItemWithAssignment — so a generated Work Item is a Work Item in
 * every respect: same table, same assignment mechanism, same downstream
 * reporting/acceptance/history. This is not a second task engine; it is the
 * same one, called from a second place.
 */
export async function createLinkedWorkItem(input: {
  organisationId: number;
  title: string;
  description: string | null;
  expectedOutput: string | null;
  dueAt: string | null;
  departmentId?: number | null;
  createdBy: number;
  assigneeProfileId: number;
  sourceCapabilityId?: number | null;
  sourceScheduleId?: number | null;
  occurrenceKey?: string | null;
  contractId?: number | null;
  employmentRecordId?: number | null;
}) {
  const { workItem, assignment } = await createWorkItemWithAssignment({
    organisationId: input.organisationId,
    title: input.title,
    description: input.description,
    expectedOutput: input.expectedOutput,
    dueAt: input.dueAt,
    projectId: null,
    parentId: null,
    departmentId: input.departmentId ?? null,
    createdBy: input.createdBy,
    assigneeProfileId: input.assigneeProfileId,
    sourceCapabilityId: input.sourceCapabilityId ?? null,
    sourceScheduleId: input.sourceScheduleId ?? null,
    occurrenceKey: input.occurrenceKey ?? null,
    contractId: input.contractId ?? null,
    employmentRecordId: input.employmentRecordId ?? null,
  });

  if (input.assigneeProfileId !== input.createdBy) {
    await createNotification({
      recipientProfileId: input.assigneeProfileId,
      type: "work.assigned",
      message: `You have been assigned "${workItem.title}".`,
      organisationId: workItem.organisation_id,
      workItemId: workItem.id,
      actionUrl: `/work/${workItem.id}`,
    });
  }

  return { workItem, assignment };
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

async function reportsWithAttachments(
  workItemId: number,
): Promise<PublicReport[]> {
  const reports = await listReportsForItem(workItemId);
  const attachments = await listAttachmentsForReports(
    reports.map((report) => report.id),
  );

  return reports.map((report) =>
    publicReport(report, attachments.get(report.id) ?? []),
  );
}

export async function getWorkItem(userId: number, workItemId: number) {
  const { workItem, assignments } = await requireVisibleItem(userId, workItemId);
  const active = assignments.find((row) => row.status === "active") ?? null;

  const children = await listChildWorkItems(workItem.id, workItem.organisation_id);
  const reports = await reportsWithAttachments(workItem.id);

  return {
    workItem: publicWorkItem(workItem),
    activeAssignment: active ? publicAssignment(active) : null,
    assignmentHistory: assignments.map(publicAssignment),
    children: children.map(publicWorkItem),
    reports,
  };
}

export async function listWorkChildren(userId: number, workItemId: number) {
  const { workItem } = await requireVisibleItem(userId, workItemId);

  const children = await listChildWorkItems(workItem.id, workItem.organisation_id);

  return { children: children.map(publicWorkItem) };
}

export async function listWorkReports(userId: number, workItemId: number) {
  const { workItem } = await requireVisibleItem(userId, workItemId);

  return { reports: await reportsWithAttachments(workItem.id) };
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
  blockedReason?: unknown;
};

export async function updateWorkItem(
  userId: number,
  workItemId: number,
  input: UpdateWorkInput,
) {
  const { workItem, assignments } = await requireVisibleItem(userId, workItemId);
  const active = assignments.find((row) => row.status === "active");

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

  const blockedReason =
    input.blockedReason === undefined
      ? { ok: true as const, value: workItem.blocked_reason }
      : validateOptionalBlockedReason(input.blockedReason);

  const errors: FieldError[] = [
    title,
    description,
    expectedOutput,
    dueAt,
    status,
    progress,
    blockedReason,
  ].flatMap((result) => (result.ok ? [] : result.errors));

  if (
    !title.ok ||
    !description.ok ||
    !expectedOutput.ok ||
    !dueAt.ok ||
    !status.ok ||
    !progress.ok ||
    !blockedReason.ok
  ) {
    throw new WorkError(422, errors);
  }

  // Blocked is a diagnostic reason, not free text: it exists only while the
  // item is actually blocked, and is required (not merely allowed) once the
  // caller sets that status — never silently guessed.
  if (status.value === "blocked" && blockedReason.value === null) {
    throw WorkError.field(
      422,
      "blockedReason",
      "Say why this work is blocked.",
    );
  }

  const finalBlockedReason = status.value === "blocked" ? blockedReason.value : null;

  // "done" and 100% progress are the same idea seen from two directions.
  // Whichever one the caller did not explicitly set is brought into line with
  // the one they did — W0 normalizes defaults, it does not run a workflow
  // engine.
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

  const progressChanged = finalProgress !== workItem.progress;

  const updated = await updateWorkItemRow(workItem.id, {
    title: title.value,
    description: description.value,
    expected_output: expectedOutput.value,
    due_at: dueAt.value,
    status: finalStatus,
    progress: finalProgress,
    blocked_reason: finalStatus === "blocked" ? finalBlockedReason : null,
    last_activity_at: new Date().toISOString(),
    ...(progressChanged ? { last_progress_at: new Date().toISOString() } : {}),
  });

  // A finished or cancelled item can never be stalled — it drops out of the
  // scan's own candidate set from this point on, so its notice (if any) is
  // cleared here rather than left to a scan that will never see it again.
  if (finalStatus === "done" || finalStatus === "cancelled") {
    await clearStallNotice(workItem.id);
  }

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

  // The creator may always reassign; an active admin of the organisation may
  // too. Anyone else (including a past assignee) may not.
  const allowed =
    workItem.created_by === userId ||
    (await isActiveAdmin(workItem.organisation_id, userId));

  if (!allowed) {
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

  await bumpWorkActivity(workItem.id);

  if (assigneeProfileId.value !== userId) {
    await createNotification({
      recipientProfileId: assigneeProfileId.value,
      type: "work.assigned",
      message: `You have been assigned "${workItem.title}".`,
      organisationId: workItem.organisation_id,
      workItemId: workItem.id,
      actionUrl: `/work/${workItem.id}`,
    });
  }

  return {
    message: "This work item has been reassigned.",
    assignment: publicAssignment(assignment),
  };
}

/* ------------------------------------------------------------------------
   Reports
   --------------------------------------------------------------------- */

function reasonSnippet(reason: string): string {
  return reason.length > 120 ? `${reason.slice(0, 117)}...` : reason;
}

export type CreateReportInput = { body?: unknown; submit?: unknown };

export async function createReport(
  userId: number,
  workItemId: number,
  input: CreateReportInput,
) {
  const { workItem, assignments } = await requireVisibleItem(userId, workItemId);

  const active = assignments.find((row) => row.status === "active");

  // Only the person the work is currently assigned to reports on it.
  if (!active || active.assignee_profile_id !== userId) {
    throw notAllowed();
  }

  const body = validateReportBody(input.body);

  if (!body.ok) {
    throw new WorkError(422, body.errors);
  }

  // At most one open (draft or submitted) report at a time.
  const open = await findOpenReport(workItem.id);

  if (open) {
    throw WorkError.field(
      422,
      "form",
      "There is already an open report for this work item.",
    );
  }

  const submit = input.submit === true;
  const submittedAt = submit ? new Date().toISOString() : null;

  const report = await insertReport({
    workItemId: workItem.id,
    organisationId: workItem.organisation_id,
    authorProfileId: userId,
    body: body.value,
    state: submit ? "submitted" : "draft",
    submittedAt,
  });

  await bumpWorkActivity(workItem.id, { report: true });

  if (submit) {
    await updateWorkItemRow(workItem.id, {
      status: "waiting_review",
      last_activity_at: new Date().toISOString(),
    });

    if (workItem.created_by !== userId) {
      await createNotification({
        recipientProfileId: workItem.created_by,
        type: "work.report.submitted",
        message: `A report was submitted for "${workItem.title}".`,
        organisationId: workItem.organisation_id,
        workItemId: workItem.id,
        actionUrl: `/work/${workItem.id}`,
      });
    }
  }

  return {
    message: submit ? "Your report has been submitted." : "Your draft has been saved.",
    report: publicReport(report, []),
  };
}

export type UpdateReportInput = { body?: unknown };

export async function updateReport(
  userId: number,
  reportId: number,
  input: UpdateReportInput,
) {
  const { report, workItem } = await requireVisibleReport(userId, reportId);

  // Only the author may edit, and only while it is still a draft.
  if (report.author_profile_id !== userId) {
    throw notAllowed();
  }

  if (report.state !== "draft") {
    throw WorkError.field(
      422,
      "form",
      "Only a draft report can be edited.",
    );
  }

  const body = validateReportBody(input.body);

  if (!body.ok) {
    throw new WorkError(422, body.errors);
  }

  const updated = await updateReportBody(report.id, body.value);

  await bumpWorkActivity(workItem.id, { report: true });

  const attachments = await listAttachmentsForReport(report.id);

  return {
    message: "Your draft has been saved.",
    report: publicReport(updated, attachments),
  };
}

export async function submitReport(userId: number, reportId: number) {
  const { report, workItem } = await requireVisibleReport(userId, reportId);

  if (report.author_profile_id !== userId) {
    throw notAllowed();
  }

  if (report.state !== "draft") {
    throw WorkError.field(422, "form", "Only a draft report can be submitted.");
  }

  const submitted = await transitionReport(report.id, {
    state: "submitted",
    submittedAt: new Date().toISOString(),
  });

  await updateWorkItemRow(workItem.id, {
    status: "waiting_review",
    last_activity_at: new Date().toISOString(),
  });

  await bumpWorkActivity(workItem.id, { report: true });

  if (workItem.created_by !== userId) {
    await createNotification({
      recipientProfileId: workItem.created_by,
      type: "work.report.submitted",
      message: `A report was submitted for "${workItem.title}".`,
      organisationId: workItem.organisation_id,
      workItemId: workItem.id,
      actionUrl: `/work/${workItem.id}`,
    });
  }

  const attachments = await listAttachmentsForReport(report.id);

  return {
    message: "Your report has been submitted.",
    report: publicReport(submitted, attachments),
  };
}

export async function acceptReport(userId: number, reportId: number) {
  const { report, workItem } = await requireVisibleReport(userId, reportId);

  await requireReviewer(userId, workItem);

  if (report.state !== "submitted") {
    throw WorkError.field(
      422,
      "form",
      "Only a submitted report can be accepted.",
    );
  }

  const accepted = await transitionReport(report.id, {
    state: "accepted",
    reviewedByProfileId: userId,
    reviewedAt: new Date().toISOString(),
  });

  await updateWorkItemRow(workItem.id, {
    status: "done",
    progress: 100,
    last_activity_at: new Date().toISOString(),
    last_progress_at: new Date().toISOString(),
  });

  // See updateWorkItem's own note: done work can never be stalled.
  await clearStallNotice(workItem.id);

  if (report.author_profile_id !== userId) {
    await createNotification({
      recipientProfileId: report.author_profile_id,
      type: "work.report.accepted",
      message: `Your report for "${workItem.title}" was accepted.`,
      organisationId: workItem.organisation_id,
      workItemId: workItem.id,
      actionUrl: `/work/${workItem.id}`,
    });
  }

  const attachments = await listAttachmentsForReport(report.id);

  return {
    message: "The report has been accepted.",
    report: publicReport(accepted, attachments),
  };
}

export type ReturnReportInput = { reason?: unknown };

export async function returnReport(
  userId: number,
  reportId: number,
  input: ReturnReportInput,
) {
  const { report, workItem } = await requireVisibleReport(userId, reportId);

  await requireReviewer(userId, workItem);

  if (report.state !== "submitted") {
    throw WorkError.field(
      422,
      "form",
      "Only a submitted report can be returned.",
    );
  }

  const reason = validateDecisionReason(input.reason);

  if (!reason.ok) {
    throw new WorkError(422, reason.errors);
  }

  // The returned row is preserved with its reason; the author may later start
  // a brand new report. History is never destroyed.
  const returned = await transitionReport(report.id, {
    state: "returned",
    reviewedByProfileId: userId,
    reviewedAt: new Date().toISOString(),
    decisionReason: reason.value,
  });

  await updateWorkItemRow(workItem.id, {
    status: "in_progress",
    last_activity_at: new Date().toISOString(),
  });

  if (report.author_profile_id !== userId) {
    await createNotification({
      recipientProfileId: report.author_profile_id,
      type: "work.report.returned",
      message: `Your report for "${workItem.title}" was returned: ${reasonSnippet(
        reason.value,
      )}`,
      organisationId: workItem.organisation_id,
      workItemId: workItem.id,
      actionUrl: `/work/${workItem.id}`,
    });
  }

  const attachments = await listAttachmentsForReport(report.id);

  return {
    message: "The report has been returned.",
    report: publicReport(returned, attachments),
  };
}

/* ------------------------------------------------------------------------
   Report attachments
   --------------------------------------------------------------------- */

export type AddAttachmentInput = {
  fileBuffer: Buffer;
  fileName: string;
  contentType: string;
};

export async function addAttachment(
  userId: number,
  reportId: number,
  input: AddAttachmentInput,
) {
  const { report, workItem } = await requireVisibleReport(userId, reportId);

  // Evidence is tied to a specific submission: only the author, and only while
  // the report is still open (draft or submitted), may attach to it.
  if (report.author_profile_id !== userId) {
    throw notAllowed();
  }

  if (report.state !== "draft" && report.state !== "submitted") {
    throw WorkError.field(
      422,
      "form",
      "Evidence can only be attached to an open report.",
    );
  }

  if (!isAcceptedAttachmentType(input.contentType)) {
    throw WorkError.field(
      415,
      "file",
      "That file type is not supported.",
    );
  }

  if (!Buffer.isBuffer(input.fileBuffer) || input.fileBuffer.length === 0) {
    throw WorkError.field(400, "file", "No file was received.");
  }

  if (input.fileBuffer.length > MAX_ATTACHMENT_BYTES) {
    throw WorkError.field(413, "file", "Files must be 15 MB or smaller.");
  }

  const fileName = String(input.fileName || "attachment").slice(0, 255);

  const storagePath = await saveAttachment(input.fileBuffer, input.contentType);

  let row: WorkReportAttachmentRecord;

  try {
    row = await insertAttachment({
      reportId: report.id,
      workItemId: workItem.id,
      organisationId: workItem.organisation_id,
      uploadedByProfileId: userId,
      fileName,
      contentType: input.contentType.split(";")[0]?.trim() ?? input.contentType,
      byteSize: input.fileBuffer.length,
      storagePath,
    });
  } catch (error) {
    // The row could not be written — do not leave the file orphaned on disk.
    await deleteAttachment(storagePath);
    throw error;
  }

  await bumpWorkActivity(workItem.id, { report: true });

  return {
    message: "The file has been attached.",
    attachment: publicAttachment(row),
  };
}
