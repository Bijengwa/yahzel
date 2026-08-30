import { db } from "../db/knex.js";
import type { OrganisationMemberWithProfile } from "../organisation/organisation.record.js";
import { ORGANISATION_MEMBERS_TABLE } from "../organisation/organisation.record.js";
import {
  DEPARTMENT_MEMBERS_TABLE,
  DEPARTMENTS_TABLE,
  type DepartmentMemberRecord,
  type DepartmentRecord,
} from "./department.record.js";

const DEPARTMENTS = DEPARTMENTS_TABLE;
const DEPARTMENT_MEMBERS = DEPARTMENT_MEMBERS_TABLE;
const MEMBERS = ORGANISATION_MEMBERS_TABLE;

export function listDepartments(
  organisationId: number,
): Promise<DepartmentRecord[]> {
  return db<DepartmentRecord>(DEPARTMENTS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "asc");
}

export function findDepartmentById(
  id: number,
): Promise<DepartmentRecord | undefined> {
  return db<DepartmentRecord>(DEPARTMENTS).where({ id }).first();
}

/** For the one-head-per-department invariant — see hierarchy.service.ts. */
export function findDepartmentByHeadPositionId(
  headPositionId: number,
): Promise<DepartmentRecord | undefined> {
  return db<DepartmentRecord>(DEPARTMENTS)
    .where({ head_position_id: headPositionId })
    .first();
}

export async function createDepartment(input: {
  organisationId: number;
  name: string;
  parentPositionId: number | null;
  headPositionId: number | null;
}): Promise<DepartmentRecord> {
  const [row] = await db<DepartmentRecord>(DEPARTMENTS)
    .insert({
      organisation_id: input.organisationId,
      name: input.name,
      parent_position_id: input.parentPositionId,
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
  patch: Partial<
    Pick<DepartmentRecord, "name" | "parent_position_id" | "head_position_id">
  >,
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

/** Cascades to department_members via the migration 011 foreign key. */
export async function deleteDepartment(id: number): Promise<void> {
  await db<DepartmentRecord>(DEPARTMENTS).where({ id }).delete();
}

/** One grouped query for the tree's compact "N members" summary. */
export async function countMembersByDepartmentIds(
  departmentIds: number[],
): Promise<Map<number, number>> {
  if (departmentIds.length === 0) {
    return new Map();
  }

  const rows = await db<DepartmentMemberRecord>(DEPARTMENT_MEMBERS)
    .whereIn("department_id", departmentIds)
    .groupBy("department_id")
    .select("department_id")
    .count<{ department_id: number; count: string }[]>("* as count");

  return new Map(rows.map((row) => [row.department_id, Number(row.count)]));
}

/** A department's roster, joined the same way organisation.repository's listMembers is. */
export function listDepartmentMembers(
  departmentId: number,
): Promise<OrganisationMemberWithProfile[]> {
  return db(DEPARTMENT_MEMBERS)
    .join(MEMBERS, `${MEMBERS}.id`, `${DEPARTMENT_MEMBERS}.member_id`)
    .leftJoin("profiles", "profiles.id", `${MEMBERS}.profile_id`)
    .where(`${DEPARTMENT_MEMBERS}.department_id`, departmentId)
    .orderBy(`${DEPARTMENT_MEMBERS}.created_at`, "asc")
    .select<OrganisationMemberWithProfile[]>(
      `${MEMBERS}.*`,
      "profiles.full_name",
      "profiles.username",
      "profiles.email as profile_email",
      "profiles.profile_picture_url",
    );
}

export function findDepartmentMember(
  departmentId: number,
  memberId: number,
): Promise<DepartmentMemberRecord | undefined> {
  return db<DepartmentMemberRecord>(DEPARTMENT_MEMBERS)
    .where({ department_id: departmentId, member_id: memberId })
    .first();
}

export async function addDepartmentMember(
  departmentId: number,
  memberId: number,
): Promise<DepartmentMemberRecord> {
  const [row] = await db<DepartmentMemberRecord>(DEPARTMENT_MEMBERS)
    .insert({ department_id: departmentId, member_id: memberId })
    .returning("*");

  if (!row) {
    throw new Error("The department_members row was not returned after insert.");
  }

  return row;
}

export async function removeDepartmentMember(
  departmentId: number,
  memberId: number,
): Promise<void> {
  await db<DepartmentMemberRecord>(DEPARTMENT_MEMBERS)
    .where({ department_id: departmentId, member_id: memberId })
    .delete();
}
