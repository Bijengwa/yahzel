import type { Knex } from "knex";

import { db } from "../db/knex.js";
import { POSITIONS_TABLE } from "../hierarchy/hierarchy.record.js";
import { ORGANISATION_MEMBERS_TABLE } from "../organisation/organisation.record.js";
import {
  DEPARTMENTS_TABLE,
  DEPARTMENT_MEMBERS_TABLE,
  type DepartmentMemberRecord,
  type DepartmentMemberWithProfile,
  type DepartmentRecord,
  type DepartmentSummaryRow,
} from "./department.record.js";

const DEPARTMENTS = DEPARTMENTS_TABLE;
const DEPARTMENT_MEMBERS = DEPARTMENT_MEMBERS_TABLE;
const MEMBERS = ORGANISATION_MEMBERS_TABLE;
const POSITIONS = POSITIONS_TABLE;

/**
 * Writes accept an optional `queryable` so the occupancy/roster cleanup in
 * organisation.service's concludeMembership can run in one transaction, the
 * same way occupancy.repository already does. Reads default to `db`.
 */
type Queryable = Knex | Knex.Transaction;

/* ------------------------------------------------------------------------
   Summaries — a department with its head position's name and member count.
   --------------------------------------------------------------------- */

function summaryQuery() {
  return db(DEPARTMENTS)
    .leftJoin(POSITIONS, `${POSITIONS}.id`, `${DEPARTMENTS}.head_position_id`)
    .leftJoin(
      DEPARTMENT_MEMBERS,
      `${DEPARTMENT_MEMBERS}.department_id`,
      `${DEPARTMENTS}.id`,
    )
    .groupBy(`${DEPARTMENTS}.id`, `${POSITIONS}.name`)
    .select<DepartmentSummaryRow[]>(
      `${DEPARTMENTS}.*`,
      `${POSITIONS}.name as head_position_name`,
      db.raw(`count(${DEPARTMENT_MEMBERS}.id) as member_count`),
    );
}

export function listDepartmentSummaries(
  organisationId: number,
): Promise<DepartmentSummaryRow[]> {
  return summaryQuery()
    .where(`${DEPARTMENTS}.organisation_id`, organisationId)
    .orderBy(`${DEPARTMENTS}.created_at`, "asc");
}

export function findDepartmentSummaryById(
  organisationId: number,
  departmentId: number,
): Promise<DepartmentSummaryRow | undefined> {
  return summaryQuery()
    .where(`${DEPARTMENTS}.organisation_id`, organisationId)
    .where(`${DEPARTMENTS}.id`, departmentId)
    .first<DepartmentSummaryRow | undefined>();
}

/* ------------------------------------------------------------------------
   Plain department rows — for the org-isolation checks before a write.
   --------------------------------------------------------------------- */

export function findDepartmentById(
  id: number,
  queryable: Queryable = db,
): Promise<DepartmentRecord | undefined> {
  return queryable<DepartmentRecord>(DEPARTMENTS).where({ id }).first();
}

export async function insertDepartment(input: {
  organisationId: number;
  name: string;
  headPositionId: number | null;
}): Promise<DepartmentRecord> {
  const [row] = await db<DepartmentRecord>(DEPARTMENTS)
    .insert({
      organisation_id: input.organisationId,
      name: input.name,
      head_position_id: input.headPositionId,
    })
    .returning("*");

  if (!row) {
    throw new Error("The department row was not returned after insert.");
  }

  return row;
}

export async function updateDepartment(
  id: number,
  patch: Partial<Pick<DepartmentRecord, "name" | "head_position_id">>,
): Promise<DepartmentRecord> {
  const [row] = await db<DepartmentRecord>(DEPARTMENTS)
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() as unknown as string })
    .returning("*");

  if (!row) {
    throw new Error(`Department ${id} disappeared during update.`);
  }

  return row;
}

/** The department_members rows cascade with it (see migration 011). */
export async function deleteDepartment(id: number): Promise<void> {
  await db<DepartmentRecord>(DEPARTMENTS).where({ id }).delete();
}

/* ------------------------------------------------------------------------
   Department members — the roster, joined to each person for display.
   --------------------------------------------------------------------- */

function departmentMemberQuery() {
  return db(DEPARTMENT_MEMBERS)
    .join(MEMBERS, `${MEMBERS}.id`, `${DEPARTMENT_MEMBERS}.member_id`)
    .leftJoin("profiles", "profiles.id", `${MEMBERS}.profile_id`)
    .select<DepartmentMemberWithProfile[]>(
      `${DEPARTMENT_MEMBERS}.id as id`,
      `${MEMBERS}.id as member_id`,
      `${MEMBERS}.profile_id as profile_id`,
      `${MEMBERS}.designation as designation`,
      `${MEMBERS}.title as title`,
      `${MEMBERS}.email as member_email`,
      "profiles.full_name as full_name",
      "profiles.email as profile_email",
      `${DEPARTMENT_MEMBERS}.created_at as added_at`,
    );
}

export function listDepartmentMembers(
  departmentId: number,
): Promise<DepartmentMemberWithProfile[]> {
  return departmentMemberQuery()
    .where(`${DEPARTMENT_MEMBERS}.department_id`, departmentId)
    .orderBy(`${DEPARTMENT_MEMBERS}.created_at`, "asc");
}

export function findDepartmentMember(
  departmentId: number,
  memberId: number,
): Promise<DepartmentMemberWithProfile | undefined> {
  return departmentMemberQuery()
    .where(`${DEPARTMENT_MEMBERS}.department_id`, departmentId)
    .where(`${DEPARTMENT_MEMBERS}.member_id`, memberId)
    .first<DepartmentMemberWithProfile | undefined>();
}

export async function insertDepartmentMember(
  departmentId: number,
  memberId: number,
): Promise<DepartmentMemberRecord> {
  const [row] = await db<DepartmentMemberRecord>(DEPARTMENT_MEMBERS)
    .insert({ department_id: departmentId, member_id: memberId })
    .returning("*");

  if (!row) {
    throw new Error("The department member row was not returned after insert.");
  }

  return row;
}

/** Removes one person from one department. Returns the number of rows removed. */
export function deleteDepartmentMember(
  departmentId: number,
  memberId: number,
): Promise<number> {
  return db(DEPARTMENT_MEMBERS)
    .where({ department_id: departmentId, member_id: memberId })
    .delete();
}

/**
 * Every department one member currently belongs to — the reverse of
 * listDepartmentMembers. Used by the employment record to display "which
 * department is this person in" without inventing a second hierarchy: it
 * reads the same department_members roster the Departments panel already
 * writes to.
 */
export function listDepartmentsForMember(
  memberId: number,
): Promise<DepartmentRecord[]> {
  return db<DepartmentRecord>(DEPARTMENTS)
    .join(
      DEPARTMENT_MEMBERS,
      `${DEPARTMENT_MEMBERS}.department_id`,
      `${DEPARTMENTS}.id`,
    )
    .where(`${DEPARTMENT_MEMBERS}.member_id`, memberId)
    .select(`${DEPARTMENTS}.*`)
    .orderBy(`${DEPARTMENTS}.name`, "asc");
}

/**
 * Removes a member from every department they are in. Used when a membership
 * is concluded: department_members keeps no history, so the row is deleted (a
 * returning member is trivially re-added). Scoped to the member — member_id
 * references organisation_members.id, which is itself organisation-specific,
 * so this never touches another organisation's rosters.
 */
export function deleteDepartmentMembershipsForMember(
  memberId: number,
  queryable: Queryable = db,
): Promise<number> {
  return queryable(DEPARTMENT_MEMBERS).where({ member_id: memberId }).delete();
}
