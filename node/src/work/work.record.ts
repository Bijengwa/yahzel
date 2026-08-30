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

export const WORK_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "waiting_review",
  "done",
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
