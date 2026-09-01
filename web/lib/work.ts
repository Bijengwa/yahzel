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
  "cancelled",
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
  /** Phase 2 links — all optional, all in the same organisation. */
  projectId: number | null;
  parentId: number | null;
  departmentId: number | null;
  /** Always present; stamped on any activity. */
  lastActivityAt: string;
  /** Set when progress last changed. */
  lastProgressAt: string | null;
  /** Set on report activity. */
  lastReportAt: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------------
   Reports — a Work Item's evidence trail. At most one report is non-terminal
   (draft or submitted) at a time; returning preserves the row and the
   assignee writes a new one afterwards.
   --------------------------------------------------------------------- */

export const REPORT_STATES = [
  "draft",
  "submitted",
  "accepted",
  "returned",
] as const;

export type ReportState = (typeof REPORT_STATES)[number];

export type WorkAttachment = {
  id: number;
  reportId: number;
  workItemId: number;
  uploadedByProfileId: number;
  fileName: string;
  contentType: string;
  byteSize: number;
  /** Relative to the API origin — join with assetUrl before use. */
  url: string;
  createdAt: string;
};

export type WorkReport = {
  id: number;
  workItemId: number;
  organisationId: number;
  authorProfileId: number;
  body: string;
  state: ReportState;
  decisionReason: string | null;
  reviewedByProfileId: number | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: WorkAttachment[];
};

export const REPORT_STATE_LABELS: Record<ReportState, string> = {
  draft: "Draft",
  submitted: "Submitted",
  accepted: "Accepted",
  returned: "Returned",
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
  { value: "cancelled", label: "Cancelled" },
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
  /** Direct children, one level deep, oldest first. */
  children: WorkItem[];
  /** Full report history, oldest first, each with its attachments. */
  reports: WorkReport[];
}> {
  return apiRequest(`/api/work/${id}`);
}

/** Direct children of a Work Item (one level), oldest first. */
export function fetchWorkChildren(
  id: number,
): Promise<{ children: WorkItem[] }> {
  return apiRequest(`/api/work/${id}/children`);
}

/** Full report history for a Work Item, oldest first. */
export function fetchWorkReports(
  id: number,
): Promise<{ reports: WorkReport[] }> {
  return apiRequest(`/api/work/${id}/reports`);
}

export type CreateWorkInput = {
  organisationId: number;
  title: string;
  description: string | null;
  expectedOutput: string | null;
  dueAt: string | null;
  assigneeProfileId: number;
  /** Optional Phase 2 links — omit or send null to leave unset. */
  projectId?: number | null;
  parentId?: number | null;
  departmentId?: number | null;
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

/* ------------------------------------------------------------------------
   Report lifecycle — only the active assignee writes them; only the work
   creator or an org admin reviews them.
   --------------------------------------------------------------------- */

export type CreateReportInput = {
  body: string;
  /** Omitted/false saves a draft; true creates it already submitted. */
  submit?: boolean;
};

export function createReport(
  workItemId: number,
  input: CreateReportInput,
): Promise<{ message: string; report: WorkReport }> {
  return apiRequest(`/api/work/${workItemId}/reports`, {
    method: "POST",
    body: input,
  });
}

/** Edit a draft's body (author only). */
export function updateReportDraft(
  workItemId: number,
  reportId: number,
  body: string,
): Promise<{ message: string; report: WorkReport }> {
  return apiRequest(`/api/work/${workItemId}/reports/${reportId}`, {
    method: "PATCH",
    body: { body },
  });
}

/** Move a draft to submitted (author only). */
export function submitReport(
  workItemId: number,
  reportId: number,
): Promise<{ message: string; report: WorkReport }> {
  return apiRequest(`/api/work/${workItemId}/reports/${reportId}/submit`, {
    method: "POST",
  });
}

/** Accept a submitted report (reviewer only). */
export function acceptReport(
  workItemId: number,
  reportId: number,
): Promise<{ message: string; report: WorkReport }> {
  return apiRequest(`/api/work/${workItemId}/reports/${reportId}/accept`, {
    method: "POST",
  });
}

/** Return a submitted report with a reason (reviewer only). */
export function returnReport(
  workItemId: number,
  reportId: number,
  reason: string,
): Promise<{ message: string; report: WorkReport }> {
  return apiRequest(`/api/work/${workItemId}/reports/${reportId}/return`, {
    method: "POST",
    body: { reason },
  });
}

/**
 * Attach evidence to a draft/submitted report. Mirrors the avatar upload
 * transport: a raw-body POST carrying the file's own bytes and mime type,
 * with the file name passed in the query string.
 */
export function uploadReportAttachment(
  workItemId: number,
  reportId: number,
  file: File,
): Promise<{ message: string; attachment: WorkAttachment }> {
  const query = `?fileName=${encodeURIComponent(file.name)}`;

  return apiRequest(
    `/api/work/${workItemId}/reports/${reportId}/attachments${query}`,
    {
      method: "POST",
      raw: { body: file, contentType: file.type },
    },
  );
}
