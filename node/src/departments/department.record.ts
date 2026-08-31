export const DEPARTMENTS_TABLE = "departments";
export const DEPARTMENT_MEMBERS_TABLE = "department_members";

/**
 * A department groups real people already in the organisation and, optionally,
 * names the position that heads it. See migration 011_create_departments.ts
 * for why this is a separate concept from the reporting tree: a position never
 * lists members, and a department is never a node the reporting tree renders.
 */
export type DepartmentRecord = {
  id: number;
  organisation_id: number;
  name: string;
  head_position_id: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * A department joined to its head position's name and the count of its
 * members, for the summary the frontend lists. head_position_name is null
 * when no head is set (or the position was later removed — the FK is
 * ON DELETE SET NULL).
 */
export type DepartmentSummaryRow = DepartmentRecord & {
  head_position_name: string | null;
  /** Postgres count() comes back as a string; the service coerces it. */
  member_count: string | number;
};

/** A membership row linking a department to one organisation member. */
export type DepartmentMemberRecord = {
  id: number;
  department_id: number;
  member_id: number;
  created_at: string;
};

/**
 * A department member joined to the person it represents, for display. `email`
 * is resolved by the service from the profile's address, falling back to the
 * membership's own recorded address; `member_email` and `profile_email` are
 * the two raw sources of that.
 */
export type DepartmentMemberWithProfile = {
  id: number;
  member_id: number;
  profile_id: number | null;
  designation: string;
  title: string | null;
  member_email: string | null;
  full_name: string | null;
  profile_email: string | null;
  added_at: string;
};
