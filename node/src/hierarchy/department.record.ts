export const DEPARTMENTS_TABLE = "departments";
export const DEPARTMENT_MEMBERS_TABLE = "department_members";

/**
 * A department: an organisational unit distinct from the reporting tree it
 * attaches to (see migration 011's docstring). `parent_position_id` places it
 * in the hierarchy view (migration 012); `head_position_id` names the
 * position that leads it. Neither field names a person — see
 * department.repository.ts for how department_members connects real people.
 */
export type DepartmentRecord = {
  id: number;
  organisation_id: number;
  name: string;
  parent_position_id: number | null;
  head_position_id: number | null;
  created_at: string;
  updated_at: string;
};

/** Links a department to a real organisation_members row — never a fake occupant. */
export type DepartmentMemberRecord = {
  id: number;
  department_id: number;
  member_id: number;
  created_at: string;
};
