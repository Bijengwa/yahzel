/**
 * The single row behind a Project, mirroring migration 013.
 *
 * A Project is a minimal grouping a Work Item may optionally belong to — not a
 * project-management system. status is validated in project.validation.ts, not
 * a database enum.
 */

export const PROJECTS_TABLE = "projects";

export const PROJECT_STATUSES = ["active", "archived"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

export type ProjectRecord = {
  id: number;
  organisation_id: number;

  name: string;
  description: string | null;

  /** active | archived. */
  status: string;

  created_by: number;
  created_at: string;
  updated_at: string;
};
