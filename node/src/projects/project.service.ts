import type { ProfileRecord } from "../db/profile-record.js";
import { findProfileById } from "../profile/profile.repository.js";
import {
  findMembership,
  findOrganisationById,
} from "../organisation/organisation.repository.js";
import type { OrganisationMemberRecord } from "../organisation/organisation.record.js";
import { findDepartmentById } from "../departments/department.repository.js";
import { createNotification } from "../notifications/notification.service.js";
import {
  findWorkItemById,
  listActiveAssignments,
  listWorkItemsForProject,
  setWorkItemProject,
} from "../work/work.repository.js";
import { publicWorkItem } from "../work/work.service.js";
import { computeProjectHealth, type ProjectHealth } from "./project.health.service.js";
import {
  PROJECT_STATUS_TRANSITIONS,
  type ProjectEventRecord,
  type ProjectMemberWithProfile,
  type ProjectOutcomeRecord,
  type ProjectRecord,
  type ProjectStatus,
} from "./project.record.js";
import {
  deleteProjectMember,
  findOutcomeById,
  findProjectById,
  findProjectMember,
  insertOutcome,
  insertProject,
  insertProjectEvent,
  insertProjectMember,
  listOutcomesForProject,
  listProjectEvents,
  listProjectMembers,
  listProjects,
  updateOutcome as updateOutcomeRow,
  updateProject as updateProjectRow,
} from "./project.repository.js";
import {
  validateOptionalPositiveId,
  validateOutcomeDescription,
  validateOutcomeStatus,
  validateOutcomeTitle,
  validatePositiveId,
  validateProjectDate,
  validateProjectDescription,
  validateProjectName,
  validateProjectStatus,
  type FieldError,
} from "./project.validation.js";

/**
 * Carries field-scoped messages so the browser can put each one under the
 * input that caused it — the same contract WorkError/DepartmentError use.
 */
export class ProjectError extends Error {
  status: number;
  errors: FieldError[];

  constructor(status: number, errors: FieldError[]) {
    super(errors[0]?.message ?? "Request failed.");
    this.status = status;
    this.errors = errors;
  }

  static field(status: number, field: string, message: string): ProjectError {
    return new ProjectError(status, [{ field, message }]);
  }
}

const notFoundProject = () =>
  ProjectError.field(404, "form", "That project could not be found.");

const notAllowed = () =>
  ProjectError.field(403, "form", "You are not allowed to perform this action.");

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

function publicProject(record: ProjectRecord) {
  return {
    id: record.id,
    organisationId: record.organisation_id,
    name: record.name,
    description: record.description,
    status: record.status,
    ownerProfileId: record.owner_profile_id,
    departmentId: record.department_id,
    startDate: record.start_date,
    targetEndDate: record.target_end_date,
    archivedAt: record.archived_at,
    createdBy: record.created_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function publicOutcome(record: ProjectOutcomeRecord) {
  return {
    id: record.id,
    projectId: record.project_id,
    organisationId: record.organisation_id,
    title: record.title,
    description: record.description,
    ownerProfileId: record.owner_profile_id,
    targetDate: record.target_date,
    status: record.status,
    createdBy: record.created_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function publicMember(row: ProjectMemberWithProfile) {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.full_name ?? row.profile_email ?? `Member #${row.profile_id}`,
    addedBy: row.added_by,
    addedAt: row.created_at,
  };
}

function publicEvent(record: ProjectEventRecord) {
  return {
    id: record.id,
    projectId: record.project_id,
    actorProfileId: record.actor_profile_id,
    type: record.type,
    message: record.message,
    createdAt: record.created_at,
  };
}

export type PublicProject = ReturnType<typeof publicProject>;
export type PublicOutcome = ReturnType<typeof publicOutcome>;
export type PublicMember = ReturnType<typeof publicMember>;
export type PublicEvent = ReturnType<typeof publicEvent>;

/* ------------------------------------------------------------------------
   Access — a project belongs to an organisation, so membership is what's
   checked. An organisation/project the caller does not belong to reads as
   "not found", the same way the rest of the app treats a private record.
   --------------------------------------------------------------------- */

async function requireOrganisationMembership(
  userId: number,
  organisationId: number,
): Promise<OrganisationMemberRecord> {
  const organisation = await findOrganisationById(organisationId);
  const membership = organisation
    ? await findMembership(organisationId, userId)
    : undefined;

  if (!organisation || !membership) {
    throw ProjectError.field(
      404,
      "form",
      "That organisation could not be found.",
    );
  }

  if (membership.status !== "active") {
    throw notAllowed();
  }

  return membership;
}

async function requireProjectInOrganisation(
  organisationId: number,
  projectId: number,
): Promise<ProjectRecord> {
  const project = await findProjectById(projectId);

  // Cross-org and non-existent both read as "not found here" — a project id
  // from another organisation never reveals it exists.
  if (!project || project.organisation_id !== organisationId) {
    throw notFoundProject();
  }

  return project;
}

/** Any active member of the organisation may view its projects. */
async function requireProjectView(
  userId: number,
  organisationId: number,
  projectId: number,
): Promise<{ membership: OrganisationMemberRecord; project: ProjectRecord }> {
  const membership = await requireOrganisationMembership(userId, organisationId);
  const project = await requireProjectInOrganisation(organisationId, projectId);

  return { membership, project };
}

function isManager(
  membership: OrganisationMemberRecord,
  project: ProjectRecord,
  userId: number,
): boolean {
  return membership.system_role === "admin" || project.owner_profile_id === userId;
}

/**
 * Managing a Project — its details, status, membership, outcomes and its
 * Work links — is the owner's or an organisation admin's call. Any active
 * member may still create Work under it directly (Work's own authorization
 * is unchanged, see work.service.ts), but the container itself is not
 * everybody's to reshape.
 */
async function requireProjectManage(
  userId: number,
  organisationId: number,
  projectId: number,
): Promise<{ membership: OrganisationMemberRecord; project: ProjectRecord }> {
  const { membership, project } = await requireProjectView(
    userId,
    organisationId,
    projectId,
  );

  if (!isManager(membership, project, userId)) {
    throw notAllowed();
  }

  return { membership, project };
}

async function requireProfileRecord(userId: number): Promise<ProfileRecord> {
  const profile = await findProfileById(userId);

  if (!profile) {
    throw ProjectError.field(404, "form", "Your profile could not be found.");
  }

  return profile;
}

async function requireEligibleMember(
  organisationId: number,
  profileId: number,
): Promise<void> {
  const membership = await findMembership(organisationId, profileId);

  if (!membership || membership.status !== "active") {
    throw ProjectError.field(
      422,
      "profileId",
      "That person is not an active member of this organisation.",
    );
  }
}

/* ------------------------------------------------------------------------
   Same-organisation resolution of optional links
   --------------------------------------------------------------------- */

async function resolveDepartment(
  organisationId: number,
  raw: unknown,
): Promise<number | null> {
  const departmentId = validateOptionalPositiveId(raw, "departmentId");

  if (!departmentId.ok) {
    throw new ProjectError(422, departmentId.errors);
  }

  if (departmentId.value === null) {
    return null;
  }

  const department = await findDepartmentById(departmentId.value);

  if (!department || department.organisation_id !== organisationId) {
    throw ProjectError.field(
      422,
      "departmentId",
      "That department could not be found in this organisation.",
    );
  }

  return department.id;
}

async function resolveOwner(
  organisationId: number,
  raw: unknown,
  fallback: number,
): Promise<number> {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  const ownerId = validatePositiveId(raw, "ownerProfileId");

  if (!ownerId.ok) {
    throw new ProjectError(422, ownerId.errors);
  }

  const membership = await findMembership(organisationId, ownerId.value);

  if (!membership || membership.status !== "active") {
    throw ProjectError.field(
      422,
      "ownerProfileId",
      "That person is not an active member of this organisation.",
    );
  }

  return ownerId.value;
}

/* ------------------------------------------------------------------------
   Events — every mutation records one line of traceable history.
   --------------------------------------------------------------------- */

async function recordEvent(
  project: ProjectRecord,
  actorProfileId: number,
  type: string,
  message: string,
): Promise<void> {
  await insertProjectEvent({
    projectId: project.id,
    organisationId: project.organisation_id,
    actorProfileId,
    type,
    message,
  });
}

/* ------------------------------------------------------------------------
   Read
   --------------------------------------------------------------------- */

export async function listOrganisationProjects(
  userId: number,
  organisationId: number,
) {
  await requireOrganisationMembership(userId, organisationId);

  const rows = await listProjects(organisationId);

  return { projects: rows.map(publicProject) };
}

/**
 * Everything a Project detail page needs in one call: the record, its
 * contributors, its outcomes, the Work linked to it, its derived health, and
 * its recent history — mirroring how getWorkItem already bundles children
 * and reports rather than making the browser assemble several fetches.
 */
export async function getProjectOverview(
  userId: number,
  organisationId: number,
  projectId: number,
) {
  const { project } = await requireProjectView(userId, organisationId, projectId);

  const [memberRows, outcomes, workItems, events] = await Promise.all([
    listProjectMembers(project.id),
    listOutcomesForProject(project.id),
    listWorkItemsForProject(project.id),
    listProjectEvents(project.id, 50),
  ]);

  const activeByItem = await listActiveAssignments(workItems.map((item) => item.id));
  const health = await computeProjectHealth(project, outcomes);

  return {
    project: publicProject(project),
    members: memberRows.map(publicMember),
    outcomes: outcomes.map(publicOutcome),
    work: workItems.map((item) => ({
      ...publicWorkItem(item),
      activeAssigneeProfileId: activeByItem.has(item.id)
        ? activeByItem.get(item.id)!.assignee_profile_id
        : null,
    })),
    health,
    events: events.map(publicEvent),
  };
}

export async function getProjectHealth(
  userId: number,
  organisationId: number,
  projectId: number,
): Promise<{ health: ProjectHealth }> {
  const { project } = await requireProjectView(userId, organisationId, projectId);
  const outcomes = await listOutcomesForProject(project.id);

  return { health: await computeProjectHealth(project, outcomes) };
}

export async function listProjectHistory(
  userId: number,
  organisationId: number,
  projectId: number,
) {
  const { project } = await requireProjectView(userId, organisationId, projectId);
  const events = await listProjectEvents(project.id, 200);

  return { events: events.map(publicEvent) };
}

/* ------------------------------------------------------------------------
   Create
   --------------------------------------------------------------------- */

export type CreateProjectInput = {
  name?: unknown;
  description?: unknown;
  status?: unknown;
  ownerProfileId?: unknown;
  departmentId?: unknown;
  startDate?: unknown;
  targetEndDate?: unknown;
};

/** Any active organisation member may start a Project — the same openness Work creation already has. */
export async function createProject(
  userId: number,
  organisationId: number,
  input: CreateProjectInput,
) {
  await requireOrganisationMembership(userId, organisationId);

  const name = validateProjectName(input.name);
  const description = validateProjectDescription(input.description);
  const status =
    input.status === undefined || input.status === null || input.status === ""
      ? ({ ok: true as const, value: "planned" as const })
      : validateProjectStatus(input.status);
  const startDate = validateProjectDate(input.startDate, "startDate");
  const targetEndDate = validateProjectDate(input.targetEndDate, "targetEndDate");

  const errors: FieldError[] = [
    name,
    description,
    status,
    startDate,
    targetEndDate,
  ].flatMap((result) => (result.ok ? [] : result.errors));

  if (
    !name.ok ||
    !description.ok ||
    !status.ok ||
    !startDate.ok ||
    !targetEndDate.ok
  ) {
    throw new ProjectError(422, errors);
  }

  const ownerProfileId = await resolveOwner(
    organisationId,
    input.ownerProfileId,
    userId,
  );
  const departmentId = await resolveDepartment(organisationId, input.departmentId);

  const created = await insertProject({
    organisationId,
    name: name.value,
    description: description.value,
    status: status.value,
    ownerProfileId,
    departmentId,
    startDate: startDate.value,
    targetEndDate: targetEndDate.value,
    createdBy: userId,
  });

  const actor = await requireProfileRecord(userId);
  await recordEvent(
    created,
    userId,
    "created",
    `${actor.full_name} created this project.`,
  );

  if (ownerProfileId !== userId) {
    await createNotification({
      recipientProfileId: ownerProfileId,
      type: "project.owner_changed",
      message: `${actor.full_name} made you the owner of "${created.name}".`,
      organisationId,
      actionUrl: `/projects/${created.id}`,
    });
  }

  return { message: `${created.name} has been created.`, project: publicProject(created) };
}

/* ------------------------------------------------------------------------
   Update details
   --------------------------------------------------------------------- */

export type UpdateProjectInput = {
  name?: unknown;
  description?: unknown;
  ownerProfileId?: unknown;
  departmentId?: unknown;
  startDate?: unknown;
  targetEndDate?: unknown;
};

export async function updateProjectDetails(
  userId: number,
  organisationId: number,
  projectId: number,
  input: UpdateProjectInput,
) {
  const { project } = await requireProjectManage(userId, organisationId, projectId);

  const patch: Partial<
    Pick<
      ProjectRecord,
      | "name"
      | "description"
      | "owner_profile_id"
      | "department_id"
      | "start_date"
      | "target_end_date"
    >
  > = {};

  if (input.name !== undefined) {
    const name = validateProjectName(input.name);

    if (!name.ok) {
      throw new ProjectError(422, name.errors);
    }

    patch.name = name.value;
  }

  if (input.description !== undefined) {
    const description = validateProjectDescription(input.description);

    if (!description.ok) {
      throw new ProjectError(422, description.errors);
    }

    patch.description = description.value;
  }

  if (input.startDate !== undefined) {
    const startDate = validateProjectDate(input.startDate, "startDate");

    if (!startDate.ok) {
      throw new ProjectError(422, startDate.errors);
    }

    patch.start_date = startDate.value;
  }

  if (input.targetEndDate !== undefined) {
    const targetEndDate = validateProjectDate(input.targetEndDate, "targetEndDate");

    if (!targetEndDate.ok) {
      throw new ProjectError(422, targetEndDate.errors);
    }

    patch.target_end_date = targetEndDate.value;
  }

  if (input.departmentId !== undefined) {
    patch.department_id = await resolveDepartment(organisationId, input.departmentId);
  }

  let ownerChangedTo: number | null = null;

  if (input.ownerProfileId !== undefined) {
    const ownerId = await resolveOwner(
      organisationId,
      input.ownerProfileId,
      project.owner_profile_id,
    );

    if (ownerId !== project.owner_profile_id) {
      patch.owner_profile_id = ownerId;
      ownerChangedTo = ownerId;
    }
  }

  const updated =
    Object.keys(patch).length > 0
      ? await updateProjectRow(project.id, patch)
      : project;

  const actor = await requireProfileRecord(userId);

  if (Object.keys(patch).length > 0) {
    await recordEvent(
      updated,
      userId,
      ownerChangedTo !== null ? "owner_changed" : "details_updated",
      ownerChangedTo !== null
        ? `${actor.full_name} changed the project owner.`
        : `${actor.full_name} updated the project details.`,
    );
  }

  if (ownerChangedTo !== null && ownerChangedTo !== userId) {
    await createNotification({
      recipientProfileId: ownerChangedTo,
      type: "project.owner_changed",
      message: `${actor.full_name} made you the owner of "${updated.name}".`,
      organisationId,
      actionUrl: `/projects/${updated.id}`,
    });
  }

  return { message: "This project has been updated.", project: publicProject(updated) };
}

/* ------------------------------------------------------------------------
   Lifecycle — status transitions and archive/unarchive.
   --------------------------------------------------------------------- */

export async function updateProjectStatus(
  userId: number,
  organisationId: number,
  projectId: number,
  input: { status?: unknown },
) {
  const { project } = await requireProjectManage(userId, organisationId, projectId);

  const status = validateProjectStatus(input.status);

  if (!status.ok) {
    throw new ProjectError(422, status.errors);
  }

  const current = project.status as ProjectStatus;

  if (status.value === current) {
    return { message: "No change.", project: publicProject(project) };
  }

  const allowed = PROJECT_STATUS_TRANSITIONS[current] ?? [];

  if (!allowed.includes(status.value)) {
    throw ProjectError.field(
      422,
      "status",
      `A project cannot move from "${current}" to "${status.value}".`,
    );
  }

  const updated = await updateProjectRow(project.id, { status: status.value });

  const actor = await requireProfileRecord(userId);
  await recordEvent(
    updated,
    userId,
    "status_changed",
    `${actor.full_name} changed the status from "${current}" to "${status.value}".`,
  );

  const recipients = new Set<number>([updated.owner_profile_id]);
  const members = await listProjectMembers(updated.id);
  for (const member of members) {
    recipients.add(member.profile_id);
  }
  recipients.delete(userId);

  await Promise.all(
    [...recipients].map((recipientProfileId) =>
      createNotification({
        recipientProfileId,
        type: "project.status_changed",
        message: `${actor.full_name} moved "${updated.name}" to ${status.value}.`,
        organisationId,
        actionUrl: `/projects/${updated.id}`,
      }),
    ),
  );

  return {
    message: `This project is now ${status.value}.`,
    project: publicProject(updated),
  };
}

export async function archiveProject(
  userId: number,
  organisationId: number,
  projectId: number,
) {
  const { project } = await requireProjectManage(userId, organisationId, projectId);

  if (project.archived_at !== null) {
    return { message: "This project is already archived.", project: publicProject(project) };
  }

  const updated = await updateProjectRow(project.id, {
    archived_at: new Date().toISOString(),
  });

  const actor = await requireProfileRecord(userId);
  await recordEvent(updated, userId, "archived", `${actor.full_name} archived this project.`);

  return { message: "This project has been archived.", project: publicProject(updated) };
}

export async function unarchiveProject(
  userId: number,
  organisationId: number,
  projectId: number,
) {
  const { project } = await requireProjectManage(userId, organisationId, projectId);

  if (project.archived_at === null) {
    return { message: "This project is not archived.", project: publicProject(project) };
  }

  const updated = await updateProjectRow(project.id, { archived_at: null });

  const actor = await requireProfileRecord(userId);
  await recordEvent(updated, userId, "unarchived", `${actor.full_name} restored this project from the archive.`);

  return { message: "This project has been restored.", project: publicProject(updated) };
}

/* ------------------------------------------------------------------------
   Members — contributors. The owner is managed via updateProjectDetails.
   --------------------------------------------------------------------- */

export async function listMembers(
  userId: number,
  organisationId: number,
  projectId: number,
) {
  const { project } = await requireProjectView(userId, organisationId, projectId);
  const rows = await listProjectMembers(project.id);

  return { members: rows.map(publicMember) };
}

const UNIQUE_VIOLATION = "23505";

function duplicateMemberConflict(error: unknown): ProjectError | null {
  const candidate = error as { code?: string } | null;

  if (!candidate || candidate.code !== UNIQUE_VIOLATION) {
    return null;
  }

  return ProjectError.field(409, "profileId", "That person is already a contributor.");
}

export async function addMember(
  userId: number,
  organisationId: number,
  projectId: number,
  input: { profileId?: unknown },
) {
  const { project } = await requireProjectManage(userId, organisationId, projectId);

  const profileId = validatePositiveId(input.profileId, "profileId");

  if (!profileId.ok) {
    throw new ProjectError(422, profileId.errors);
  }

  await requireEligibleMember(organisationId, profileId.value);

  try {
    await insertProjectMember({
      projectId: project.id,
      profileId: profileId.value,
      addedBy: userId,
    });
  } catch (error) {
    throw duplicateMemberConflict(error) ?? error;
  }

  const actor = await requireProfileRecord(userId);
  const added = await requireProfileRecord(profileId.value);

  await recordEvent(
    project,
    userId,
    "member_added",
    `${actor.full_name} added ${added.full_name} as a contributor.`,
  );

  if (profileId.value !== userId) {
    await createNotification({
      recipientProfileId: profileId.value,
      type: "project.member_added",
      message: `${actor.full_name} added you to "${project.name}".`,
      organisationId,
      actionUrl: `/projects/${project.id}`,
    });
  }

  const row = await findProjectMember(project.id, profileId.value);

  if (!row) {
    throw new Error("The project member disappeared after insert.");
  }

  return {
    member: publicMember({
      ...row,
      full_name: added.full_name,
      profile_email: added.email,
    }),
  };
}

export async function removeMember(
  userId: number,
  organisationId: number,
  projectId: number,
  profileId: number,
) {
  const { project } = await requireProjectManage(userId, organisationId, projectId);

  const removed = await deleteProjectMember(project.id, profileId);

  if (removed === 0) {
    throw ProjectError.field(404, "form", "That person is not a contributor on this project.");
  }

  const actor = await requireProfileRecord(userId);
  const target = await findProfileById(profileId);

  await recordEvent(
    project,
    userId,
    "member_removed",
    `${actor.full_name} removed ${target?.full_name ?? "a contributor"} from this project.`,
  );

  return { success: true };
}

/* ------------------------------------------------------------------------
   Outcomes — a goal record; execution stays with ordinary Work.
   --------------------------------------------------------------------- */

export async function listOutcomes(
  userId: number,
  organisationId: number,
  projectId: number,
) {
  const { project } = await requireProjectView(userId, organisationId, projectId);
  const rows = await listOutcomesForProject(project.id);

  return { outcomes: rows.map(publicOutcome) };
}

export type CreateOutcomeInput = {
  title?: unknown;
  description?: unknown;
  ownerProfileId?: unknown;
  targetDate?: unknown;
  status?: unknown;
};

export async function createOutcome(
  userId: number,
  organisationId: number,
  projectId: number,
  input: CreateOutcomeInput,
) {
  const { project } = await requireProjectManage(userId, organisationId, projectId);

  const title = validateOutcomeTitle(input.title);
  const description = validateOutcomeDescription(input.description);
  const targetDate = validateProjectDate(input.targetDate, "targetDate");
  const status =
    input.status === undefined || input.status === null || input.status === ""
      ? ({ ok: true as const, value: "not_started" as const })
      : validateOutcomeStatus(input.status);

  const errors: FieldError[] = [title, description, targetDate, status].flatMap(
    (result) => (result.ok ? [] : result.errors),
  );

  if (!title.ok || !description.ok || !targetDate.ok || !status.ok) {
    throw new ProjectError(422, errors);
  }

  let ownerProfileId: number | null = null;

  if (
    input.ownerProfileId !== undefined &&
    input.ownerProfileId !== null &&
    input.ownerProfileId !== ""
  ) {
    const ownerId = validatePositiveId(input.ownerProfileId, "ownerProfileId");

    if (!ownerId.ok) {
      throw new ProjectError(422, ownerId.errors);
    }

    await requireEligibleMember(organisationId, ownerId.value);
    ownerProfileId = ownerId.value;
  }

  const created = await insertOutcome({
    projectId: project.id,
    organisationId,
    title: title.value,
    description: description.value,
    ownerProfileId,
    targetDate: targetDate.value,
    status: status.value,
    createdBy: userId,
  });

  const actor = await requireProfileRecord(userId);
  await recordEvent(
    project,
    userId,
    "outcome_added",
    `${actor.full_name} added the outcome "${created.title}".`,
  );

  return { message: "This outcome has been added.", outcome: publicOutcome(created) };
}

export type UpdateOutcomeInput = {
  title?: unknown;
  description?: unknown;
  ownerProfileId?: unknown;
  targetDate?: unknown;
  status?: unknown;
};

export async function updateOutcomeDetails(
  userId: number,
  organisationId: number,
  projectId: number,
  outcomeId: number,
  input: UpdateOutcomeInput,
) {
  const { project } = await requireProjectManage(userId, organisationId, projectId);

  const existing = await findOutcomeById(outcomeId);

  if (!existing || existing.project_id !== project.id) {
    throw ProjectError.field(404, "form", "That outcome could not be found.");
  }

  const patch: Partial<
    Pick<
      ProjectOutcomeRecord,
      "title" | "description" | "owner_profile_id" | "target_date" | "status"
    >
  > = {};

  if (input.title !== undefined) {
    const title = validateOutcomeTitle(input.title);

    if (!title.ok) {
      throw new ProjectError(422, title.errors);
    }

    patch.title = title.value;
  }

  if (input.description !== undefined) {
    const description = validateOutcomeDescription(input.description);

    if (!description.ok) {
      throw new ProjectError(422, description.errors);
    }

    patch.description = description.value;
  }

  if (input.targetDate !== undefined) {
    const targetDate = validateProjectDate(input.targetDate, "targetDate");

    if (!targetDate.ok) {
      throw new ProjectError(422, targetDate.errors);
    }

    patch.target_date = targetDate.value;
  }

  let statusChanged = false;

  if (input.status !== undefined) {
    const status = validateOutcomeStatus(input.status);

    if (!status.ok) {
      throw new ProjectError(422, status.errors);
    }

    if (status.value !== existing.status) {
      patch.status = status.value;
      statusChanged = true;
    }
  }

  if (input.ownerProfileId !== undefined) {
    if (input.ownerProfileId === null || input.ownerProfileId === "") {
      patch.owner_profile_id = null;
    } else {
      const ownerId = validatePositiveId(input.ownerProfileId, "ownerProfileId");

      if (!ownerId.ok) {
        throw new ProjectError(422, ownerId.errors);
      }

      await requireEligibleMember(organisationId, ownerId.value);
      patch.owner_profile_id = ownerId.value;
    }
  }

  const updated =
    Object.keys(patch).length > 0
      ? await updateOutcomeRow(existing.id, patch)
      : existing;

  if (Object.keys(patch).length > 0) {
    const actor = await requireProfileRecord(userId);
    await recordEvent(
      project,
      userId,
      "outcome_updated",
      statusChanged
        ? `${actor.full_name} moved the outcome "${updated.title}" to ${updated.status}.`
        : `${actor.full_name} updated the outcome "${updated.title}".`,
    );
  }

  return { message: "This outcome has been updated.", outcome: publicOutcome(updated) };
}

/* ------------------------------------------------------------------------
   Work integration — Work stays independently executable. Linking only
   ever moves the one project_id column; every other Work field (status,
   progress, assignment, reports) is still governed entirely by Work's own
   authorization in work.service.ts.
   --------------------------------------------------------------------- */

export async function listProjectWork(
  userId: number,
  organisationId: number,
  projectId: number,
) {
  const { project } = await requireProjectView(userId, organisationId, projectId);
  const items = await listWorkItemsForProject(project.id);
  const activeByItem = await listActiveAssignments(items.map((item) => item.id));

  return {
    workItems: items.map((item) => ({
      ...publicWorkItem(item),
      activeAssigneeProfileId: activeByItem.has(item.id)
        ? activeByItem.get(item.id)!.assignee_profile_id
        : null,
    })),
  };
}

async function requireWorkItemInOrganisation(organisationId: number, workItemId: number) {
  const workItem = await findWorkItemById(workItemId);

  if (!workItem || workItem.organisation_id !== organisationId) {
    throw ProjectError.field(422, "workItemId", "That work item could not be found in this organisation.");
  }

  return workItem;
}

export async function linkWorkItem(
  userId: number,
  organisationId: number,
  projectId: number,
  workItemId: number,
) {
  const { project } = await requireProjectManage(userId, organisationId, projectId);
  const workItem = await requireWorkItemInOrganisation(organisationId, workItemId);

  const updated = await setWorkItemProject(workItem.id, project.id);

  const actor = await requireProfileRecord(userId);
  await recordEvent(
    project,
    userId,
    "work_linked",
    `${actor.full_name} linked "${updated.title}" to this project.`,
  );

  return { message: "That work item has been linked.", workItem: publicWorkItem(updated) };
}

export async function unlinkWorkItem(
  userId: number,
  organisationId: number,
  projectId: number,
  workItemId: number,
) {
  const { project } = await requireProjectManage(userId, organisationId, projectId);
  const workItem = await requireWorkItemInOrganisation(organisationId, workItemId);

  if (workItem.project_id !== project.id) {
    throw ProjectError.field(404, "form", "That work item is not linked to this project.");
  }

  const updated = await setWorkItemProject(workItem.id, null);

  const actor = await requireProfileRecord(userId);
  await recordEvent(
    project,
    userId,
    "work_unlinked",
    `${actor.full_name} unlinked "${updated.title}" from this project.`,
  );

  return { message: "That work item has been unlinked.", workItem: publicWorkItem(updated) };
}
