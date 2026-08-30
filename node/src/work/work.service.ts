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

  // Reassignment authority is the creator, and only the creator: an org
  // admin with no history on this Work Item has no visibility into it
  // either, and granting them reassignment power would silently expand
  // W0's visibility rule through the back door.
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
