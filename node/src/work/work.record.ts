/**
 * The two rows behind the Work engine, mirroring migration 008.
 *
 * A Work Item never carries who it is assigned to. That fact lives in
 * work_assignments so a reassignment is a new row, not an overwritten
 * column — the same "history, never overwritten" idea organisation
 * memberships already use.
 */

export const WORK_ITEMS_TABLE = "work_items";
export const WORK_ASSIGNMENTS_TABLE = "work_assignments";
export const WORK_REPORTS_TABLE = "work_reports";
export const WORK_REPORT_ATTACHMENTS_TABLE = "work_report_attachments";

export const WORK_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "waiting_review",
  "done",
  "cancelled",
] as const;

export type WorkStatus = (typeof WORK_STATUSES)[number];

export function isWorkStatus(value: string): value is WorkStatus {
  return (WORK_STATUSES as readonly string[]).includes(value);
}

/** active | completed | cancelled | reassigned. Never deleted. */
export const ASSIGNMENT_STATUSES = [
  "active",
  "completed",
  "cancelled",
  "reassigned",
] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export function isAssignmentStatus(value: string): value is AssignmentStatus {
  return (ASSIGNMENT_STATUSES as readonly string[]).includes(value);
}

export type WorkItemRecord = {
  id: number;
  organisation_id: number;

  title: string;
  description: string | null;
  expected_output: string | null;

  status: string;
  progress: number;

  due_at: string | null;

  /** Phase 2 — all optional. See migrations 013/014. */
  project_id: number | null;
  parent_id: number | null;
  department_id: number | null;

  last_activity_at: string;
  last_progress_at: string | null;
  last_report_at: string | null;

  created_by: number;
  created_at: string;
  updated_at: string;
};

export type WorkAssignmentRecord = {
  id: number;
  work_item_id: number;

  assigned_by: number;
  assignee_profile_id: number;

  instructions: string | null;

  /** active | completed | cancelled | reassigned. */
  status: string;

  created_at: string;
  updated_at: string;
};

/**
 * A Work Report, mirroring migration 015. History is never destroyed: a
 * returned row is kept and the author submits a new row.
 *
 *   draft     — being written, not yet reviewable.
 *   submitted — awaiting a decision; the item sits at "waiting_review".
 *   accepted  — terminal; the item becomes "done".
 *   returned  — terminal with a reason; the item goes back to "in_progress".
 *
 * At most one of draft/submitted may exist per item at a time (partial unique
 * index in the migration).
 */
export const WORK_REPORT_STATES = [
  "draft",
  "submitted",
  "accepted",
  "returned",
] as const;

export type WorkReportState = (typeof WORK_REPORT_STATES)[number];

export function isWorkReportState(value: string): value is WorkReportState {
  return (WORK_REPORT_STATES as readonly string[]).includes(value);
}

/** The two non-terminal states — only one may be open per item at a time. */
export const OPEN_REPORT_STATES = ["draft", "submitted"] as const;

export type WorkReportRecord = {
  id: number;
  work_item_id: number;
  organisation_id: number;

  author_profile_id: number;

  body: string;

  /** draft | submitted | accepted | returned. */
  state: string;

  decision_reason: string | null;
  reviewed_by_profile_id: number | null;

  submitted_at: string | null;
  reviewed_at: string | null;

  created_at: string;
  updated_at: string;
};

/** Evidence attached to a report, mirroring migration 016. */
export type WorkReportAttachmentRecord = {
  id: number;
  report_id: number;
  work_item_id: number;
  organisation_id: number;

  uploaded_by_profile_id: number;

  file_name: string;
  content_type: string;
  byte_size: number;
  storage_path: string;

  created_at: string;
};
