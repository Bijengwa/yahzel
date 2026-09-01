import {
  findMembership,
  findOrganisationById,
} from "../organisation/organisation.repository.js";
import type { ProjectRecord } from "./project.record.js";
import {
  findProjectById,
  insertProject,
  listProjects,
} from "./project.repository.js";
import {
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
    createdBy: record.created_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export type PublicProject = ReturnType<typeof publicProject>;

/* ------------------------------------------------------------------------
   Access — a project belongs to an organisation, so membership is what's
   checked. An organisation the caller does not belong to reads as "not
   found", the same way the rest of the app treats a private organisation.
   --------------------------------------------------------------------- */

async function requireOrganisationMembership(
  userId: number,
  organisationId: number,
): Promise<void> {
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
    throw ProjectError.field(
      403,
      "form",
      "You are not allowed to perform this action.",
    );
  }
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

export async function getProject(
  userId: number,
  organisationId: number,
  projectId: number,
) {
  await requireOrganisationMembership(userId, organisationId);

  const project = await findProjectById(projectId);

  // Cross-org and non-existent both read as "not found here" — a project id
  // from another organisation never reveals it exists.
  if (!project || project.organisation_id !== organisationId) {
    throw ProjectError.field(404, "form", "That project could not be found.");
  }

  return { project: publicProject(project) };
}

/* ------------------------------------------------------------------------
   Create
   --------------------------------------------------------------------- */

export type CreateProjectInput = {
  name?: unknown;
  description?: unknown;
  status?: unknown;
};

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
      ? ({ ok: true as const, value: "active" as const })
      : validateProjectStatus(input.status);

  const errors: FieldError[] = [name, description, status].flatMap((result) =>
    result.ok ? [] : result.errors,
  );

  if (!name.ok || !description.ok || !status.ok) {
    throw new ProjectError(422, errors);
  }

  const created = await insertProject({
    organisationId,
    name: name.value,
    description: description.value,
    status: status.value,
    createdBy: userId,
  });

  return { project: publicProject(created) };
}
