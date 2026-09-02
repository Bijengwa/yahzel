/**
 * The rows behind a Project, mirroring migrations 013 and 020.
 *
 * A Project is a coordination layer over ordinary Work — an owner, optional
 * contributors, optional outcomes, and a traceable timeline — never a second
 * execution engine. Everything a person actually *does* toward a Project is
 * still a Work Item, linked by work_items.project_id (migration 014).
 * status/outcome status are validated in project.validation.ts, not database
 * enums, so a new state is a code change and not a migration.
 */

export const PROJECTS_TABLE = "projects";
export const PROJECT_MEMBERS_TABLE = "project_members";
export const PROJECT_OUTCOMES_TABLE = "project_outcomes";
export const PROJECT_EVENTS_TABLE = "project_events";

/**
 * planned  — set up, not yet under way.
 * active   — under way.
 * paused   — temporarily on hold; resumes to active.
 * completed / cancelled — terminal. Neither reopens; a new Project is made
 *                         instead, the same way a concluded organisation
 *                         membership is never reactivated.
 */
export const PROJECT_STATUSES = [
  "planned",
  "active",
  "paused",
  "completed",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

/** Which status changes are allowed. Absent from this map = terminal. */
export const PROJECT_STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  planned: ["active", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "cancelled"],
  completed: [],
  cancelled: [],
};

export type ProjectRecord = {
  id: number;
  organisation_id: number;

  name: string;
  description: string | null;

  /** planned | active | paused | completed | cancelled. */
  status: string;

  owner_profile_id: number;
  department_id: number | null;

  start_date: string | null;
  target_end_date: string | null;

  /** A visibility flag independent of status — never a delete. */
  archived_at: string | null;

  created_by: number;
  created_at: string;
  updated_at: string;
};

/** not_started | in_progress | done. A goal record, not a task. */
export const PROJECT_OUTCOME_STATUSES = [
  "not_started",
  "in_progress",
  "done",
] as const;

export type ProjectOutcomeStatus = (typeof PROJECT_OUTCOME_STATUSES)[number];

export function isProjectOutcomeStatus(
  value: string,
): value is ProjectOutcomeStatus {
  return (PROJECT_OUTCOME_STATUSES as readonly string[]).includes(value);
}

export type ProjectOutcomeRecord = {
  id: number;
  project_id: number;
  organisation_id: number;

  title: string;
  description: string | null;

  owner_profile_id: number | null;
  target_date: string | null;

  /** not_started | in_progress | done. */
  status: string;

  created_by: number;
  created_at: string;
  updated_at: string;
};

/** A contributor roster row. The owner is not duplicated in here. */
export type ProjectMemberRecord = {
  id: number;
  project_id: number;
  profile_id: number;
  added_by: number;
  created_at: string;
};

export type ProjectMemberWithProfile = ProjectMemberRecord & {
  full_name: string | null;
  profile_email: string | null;
};

/**
 * The vocabulary of project event types. Every one carries an already
 * rendered `message` — the same "write the sentence once" rule
 * notifications already follow — so a timeline never reassembles history
 * from a template.
 */
export const PROJECT_EVENT_TYPES = [
  "created",
  "details_updated",
  "owner_changed",
  "member_added",
  "member_removed",
  "status_changed",
  "archived",
  "unarchived",
  "outcome_added",
  "outcome_updated",
  "work_linked",
  "work_unlinked",
] as const;

export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[number];

export type ProjectEventRecord = {
  id: number;
  project_id: number;
  organisation_id: number;
  actor_profile_id: number;
  type: string;
  message: string;
  created_at: string;
};
