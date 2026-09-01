import { apiRequest } from "./api";

/**
 * A project: a named container a Work Item can optionally belong to, scoped to
 * one organisation. Mirrors node/src/projects' publicProject. Work never
 * requires a project — it is only an optional grouping — so projects are
 * always fetched and offered separately, and a plain select over the existing
 * ones is enough to link work to them.
 */
export type Project = {
  id: number;
  organisationId: number;
  name: string;
  description: string | null;
  /** active | archived */
  status: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

/** Every project in the organisation, newest first. */
export function fetchProjects(
  organisationId: number,
): Promise<{ projects: Project[] }> {
  return apiRequest(`/api/projects/${organisationId}`);
}

export type CreateProjectInput = {
  name: string;
  description?: string | null;
  status?: string;
};

export function createProject(
  organisationId: number,
  input: CreateProjectInput,
): Promise<{ project: Project }> {
  return apiRequest(`/api/projects/${organisationId}`, {
    method: "POST",
    body: input,
  });
}

export function fetchProject(
  organisationId: number,
  projectId: number,
): Promise<{ project: Project }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}`);
}
