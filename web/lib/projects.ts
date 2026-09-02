import { apiRequest } from "./api";
import type { WorkItem } from "./work";

/**
 * A Project: an organisation-scoped coordination layer over ordinary Work —
 * never a second task system. Mirrors node/src/projects' publicProject.
 * A Work Item never requires a Project; this is only ever an optional
 * container around Work that already exists independently of it.
 */
export const PROJECT_STATUSES = [
  "planned",
  "active",
  "paused",
  "completed",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planned",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function projectStatusLabel(status: string): string {
  return PROJECT_STATUS_LABELS[status as ProjectStatus] ?? status;
}

export const OUTCOME_STATUSES = ["not_started", "in_progress", "done"] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

export const OUTCOME_STATUS_LABELS: Record<OutcomeStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

export function outcomeStatusLabel(status: string): string {
  return OUTCOME_STATUS_LABELS[status as OutcomeStatus] ?? status;
}

export type Project = {
  id: number;
  organisationId: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  ownerProfileId: number;
  departmentId: number | null;
  startDate: string | null;
  targetEndDate: string | null;
  /** A visibility flag, independent of status — never a delete. */
  archivedAt: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectOutcome = {
  id: number;
  projectId: number;
  organisationId: number;
  title: string;
  description: string | null;
  ownerProfileId: number | null;
  targetDate: string | null;
  status: OutcomeStatus;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMember = {
  id: number;
  profileId: number;
  /** Resolved server-side (full name, falling back to email). */
  name: string;
  addedBy: number;
  addedAt: string;
};

export type ProjectEvent = {
  id: number;
  projectId: number;
  actorProfileId: number;
  type: string;
  /** Already a complete sentence — never reassembled from a template. */
  message: string;
  createdAt: string;
};

/**
 * Derived, read-only operational signals — factual counts and sentences,
 * never a score. See node/src/projects/project.health.service.ts.
 */
export type ProjectHealth = {
  totalWork: number;
  openWork: number;
  completedWork: number;
  overdueWork: number;
  blockedWork: number;
  stalledWork: number;
  outcomesTotal: number;
  outcomesDone: number;
  outcomesOverdue: number;
  approachingTargetDate: boolean;
  daysSinceLastActivity: number | null;
  signals: string[];
};

export type ProjectWorkItem = WorkItem & { activeAssigneeProfileId: number | null };

export type ProjectOverview = {
  project: Project;
  members: ProjectMember[];
  outcomes: ProjectOutcome[];
  work: ProjectWorkItem[];
  health: ProjectHealth;
  events: ProjectEvent[];
};

/* ------------------------------------------------------------------------
   Reference vocabulary
   --------------------------------------------------------------------- */

export function loadProjectVocabulary(): Promise<{
  projectStatuses: readonly ProjectStatus[];
  outcomeStatuses: readonly OutcomeStatus[];
}> {
  return apiRequest("/api/reference/project-vocabulary");
}

/* ------------------------------------------------------------------------
   Projects
   --------------------------------------------------------------------- */

export function fetchProjects(
  organisationId: number,
): Promise<{ projects: Project[] }> {
  return apiRequest(`/api/projects/${organisationId}`);
}

export type CreateProjectInput = {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  ownerProfileId?: number;
  departmentId?: number | null;
  startDate?: string | null;
  targetEndDate?: string | null;
};

export function createProject(
  organisationId: number,
  input: CreateProjectInput,
): Promise<{ message: string; project: Project }> {
  return apiRequest(`/api/projects/${organisationId}`, {
    method: "POST",
    body: input,
  });
}

/** The full detail bundle: project, members, outcomes, work, health, events. */
export function fetchProject(
  organisationId: number,
  projectId: number,
): Promise<ProjectOverview> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}`);
}

export type UpdateProjectInput = Partial<{
  name: string;
  description: string | null;
  ownerProfileId: number;
  departmentId: number | null;
  startDate: string | null;
  targetEndDate: string | null;
}>;

export function updateProject(
  organisationId: number,
  projectId: number,
  input: UpdateProjectInput,
): Promise<{ message: string; project: Project }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}`, {
    method: "PATCH",
    body: input,
  });
}

export function updateProjectStatus(
  organisationId: number,
  projectId: number,
  status: ProjectStatus,
): Promise<{ message: string; project: Project }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}/status`, {
    method: "POST",
    body: { status },
  });
}

export function archiveProject(
  organisationId: number,
  projectId: number,
): Promise<{ message: string; project: Project }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}/archive`, {
    method: "POST",
  });
}

export function unarchiveProject(
  organisationId: number,
  projectId: number,
): Promise<{ message: string; project: Project }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}/unarchive`, {
    method: "POST",
  });
}

export function fetchProjectHealth(
  organisationId: number,
  projectId: number,
): Promise<{ health: ProjectHealth }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}/health`);
}

export function fetchProjectHistory(
  organisationId: number,
  projectId: number,
): Promise<{ events: ProjectEvent[] }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}/events`);
}

/* ------------------------------------------------------------------------
   Members
   --------------------------------------------------------------------- */

export function fetchProjectMembers(
  organisationId: number,
  projectId: number,
): Promise<{ members: ProjectMember[] }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}/members`);
}

export function addProjectMember(
  organisationId: number,
  projectId: number,
  profileId: number,
): Promise<{ member: ProjectMember }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}/members`, {
    method: "POST",
    body: { profileId },
  });
}

export function removeProjectMember(
  organisationId: number,
  projectId: number,
  profileId: number,
): Promise<{ success: true }> {
  return apiRequest(
    `/api/projects/${organisationId}/${projectId}/members/${profileId}`,
    { method: "DELETE" },
  );
}

/* ------------------------------------------------------------------------
   Outcomes
   --------------------------------------------------------------------- */

export function fetchProjectOutcomes(
  organisationId: number,
  projectId: number,
): Promise<{ outcomes: ProjectOutcome[] }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}/outcomes`);
}

export type CreateOutcomeInput = {
  title: string;
  description?: string | null;
  ownerProfileId?: number | null;
  targetDate?: string | null;
  status?: OutcomeStatus;
};

export function createProjectOutcome(
  organisationId: number,
  projectId: number,
  input: CreateOutcomeInput,
): Promise<{ message: string; outcome: ProjectOutcome }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}/outcomes`, {
    method: "POST",
    body: input,
  });
}

export type UpdateOutcomeInput = Partial<{
  title: string;
  description: string | null;
  ownerProfileId: number | null;
  targetDate: string | null;
  status: OutcomeStatus;
}>;

export function updateProjectOutcome(
  organisationId: number,
  projectId: number,
  outcomeId: number,
  input: UpdateOutcomeInput,
): Promise<{ message: string; outcome: ProjectOutcome }> {
  return apiRequest(
    `/api/projects/${organisationId}/${projectId}/outcomes/${outcomeId}`,
    { method: "PATCH", body: input },
  );
}

/* ------------------------------------------------------------------------
   Work integration
   --------------------------------------------------------------------- */

export function fetchProjectWork(
  organisationId: number,
  projectId: number,
): Promise<{ workItems: ProjectWorkItem[] }> {
  return apiRequest(`/api/projects/${organisationId}/${projectId}/work`);
}

export function linkProjectWork(
  organisationId: number,
  projectId: number,
  workItemId: number,
): Promise<{ message: string; workItem: WorkItem }> {
  return apiRequest(
    `/api/projects/${organisationId}/${projectId}/work/${workItemId}/link`,
    { method: "POST" },
  );
}

export function unlinkProjectWork(
  organisationId: number,
  projectId: number,
  workItemId: number,
): Promise<{ message: string; workItem: WorkItem }> {
  return apiRequest(
    `/api/projects/${organisationId}/${projectId}/work/${workItemId}/unlink`,
    { method: "POST" },
  );
}
