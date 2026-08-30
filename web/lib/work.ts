import { apiRequest } from "./api";

/* ------------------------------------------------------------------------
   Shapes, mirroring what node/src/work serialises
   --------------------------------------------------------------------- */

export const WORK_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "waiting_review",
  "done",
] as const;

export type WorkStatus = (typeof WORK_STATUSES)[number];

export type WorkItem = {
  id: number;
  organisationId: number;
  title: string;
  description: string | null;
  expectedOutput: string | null;
  status: WorkStatus;
  progress: number;
  dueAt: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

/** active | completed | cancelled | reassigned. Never deleted. */
export type WorkAssignment = {
  id: number;
  workItemId: number;
  assignedBy: number;
  assigneeProfileId: number;
  instructions: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkItemSummary = WorkItem & {
  activeAssignment: WorkAssignment | null;
};

/* ------------------------------------------------------------------------
   Status vocabulary — W0 supports exactly these five, and no more. There is
   no backend reference endpoint for this; it is fixed and hardcoded, the
   same way membership/invitation statuses already are elsewhere in the app.
   --------------------------------------------------------------------- */

export const WORK_STATUS_OPTIONS: { value: WorkStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "waiting_review", label: "Waiting review" },
  { value: "done", label: "Done" },
];

export function workStatusLabel(status: string): string {
  return (
    WORK_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

/* ------------------------------------------------------------------------
   Calls
   --------------------------------------------------------------------- */

export function fetchWorkItems(): Promise<{ workItems: WorkItemSummary[] }> {
  return apiRequest("/api/work");
}

export function fetchWorkItem(id: number): Promise<{
  workItem: WorkItem;
  activeAssignment: WorkAssignment | null;
  assignmentHistory: WorkAssignment[];
}> {
  return apiRequest(`/api/work/${id}`);
}

export type CreateWorkInput = {
  organisationId: number;
  title: string;
  description: string | null;
  expectedOutput: string | null;
  dueAt: string | null;
  assigneeProfileId: number;
};

export function createWorkItem(input: CreateWorkInput): Promise<{
  message: string;
  workItem: WorkItem;
  assignment: WorkAssignment;
}> {
  return apiRequest("/api/work", { method: "POST", body: input });
}

export type UpdateWorkInput = Partial<{
  title: string;
  description: string | null;
  expectedOutput: string | null;
  dueAt: string | null;
  status: WorkStatus;
  progress: number;
}>;

export function updateWorkItem(
  id: number,
  input: UpdateWorkInput,
): Promise<{ message: string; workItem: WorkItem }> {
  return apiRequest(`/api/work/${id}`, { method: "PATCH", body: input });
}

export type AssignWorkInput = {
  assigneeProfileId: number;
  instructions: string | null;
};

export function assignWorkItem(
  id: number,
  input: AssignWorkInput,
): Promise<{ message: string; assignment: WorkAssignment }> {
  return apiRequest(`/api/work/${id}/assign`, { method: "POST", body: input });
}
