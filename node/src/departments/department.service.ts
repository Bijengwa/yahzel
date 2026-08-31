import { findPositionById } from "../hierarchy/hierarchy.repository.js";
import { findMembershipById } from "../organisation/organisation.repository.js";
import {
  requireOccupancyCapability,
  requireStructureCapability,
} from "../organisation/organisation.service.js";
import type {
  DepartmentMemberWithProfile,
  DepartmentRecord,
  DepartmentSummaryRow,
} from "./department.record.js";
import {
  deleteDepartment,
  deleteDepartmentMember,
  findDepartmentById,
  findDepartmentMember,
  findDepartmentSummaryById,
  insertDepartment,
  insertDepartmentMember,
  listDepartmentMembers,
  listDepartmentSummaries,
  updateDepartment,
} from "./department.repository.js";
import {
  validateDepartmentName,
  validateMemberId,
  validateOptionalHeadPosition,
  type FieldError,
} from "./department.validation.js";

/**
 * Carries field-scoped messages so the browser can put each one under the
 * input that caused it — the same contract HierarchyError and
 * OrganisationError use elsewhere.
 */
export class DepartmentError extends Error {
  status: number;
  errors: FieldError[];

  constructor(status: number, errors: FieldError[]) {
    super(errors[0]?.message ?? "Request failed.");
    this.status = status;
    this.errors = errors;
  }

  static field(status: number, field: string, message: string): DepartmentError {
    return new DepartmentError(status, [{ field, message }]);
  }
}

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

function publicDepartment(row: DepartmentSummaryRow) {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    name: row.name,
    headPositionId: row.head_position_id,
    headPositionName: row.head_position_name,
    memberCount: Number(row.member_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicDepartmentMember(row: DepartmentMemberWithProfile) {
  return {
    id: row.id,
    memberId: row.member_id,
    profileId: row.profile_id,
    name: row.full_name,
    email: row.profile_email ?? row.member_email ?? "",
    designation: row.designation,
    title: row.title,
    addedAt: row.added_at,
  };
}

export type PublicDepartment = ReturnType<typeof publicDepartment>;
export type PublicDepartmentMember = ReturnType<typeof publicDepartmentMember>;

/* ------------------------------------------------------------------------
   Shared lookups — never leak whether a department/position/member exists in
   another organisation; every failure reads as "not found" the same way
   hierarchy/occupancy already do.
   --------------------------------------------------------------------- */

async function requireDepartmentInOrganisation(
  organisationId: number,
  departmentId: number,
): Promise<DepartmentRecord> {
  const department = await findDepartmentById(departmentId);

  if (!department || department.organisation_id !== organisationId) {
    throw DepartmentError.field(
      404,
      "form",
      "That department could not be found.",
    );
  }

  return department;
}

/**
 * Resolves the optional head position, refusing anything that is not a
 * position in this organisation. null clears it. Returns the id (or null) to
 * store.
 */
async function resolveHeadPosition(
  organisationId: number,
  raw: unknown,
): Promise<number | null> {
  const headPositionId = validateOptionalHeadPosition(raw);

  if (!headPositionId.ok) {
    throw new DepartmentError(422, headPositionId.errors);
  }

  if (headPositionId.value === null) {
    return null;
  }

  const position = await findPositionById(headPositionId.value);

  // Never reveal another organisation's structure by a probing id — cross-org
  // and non-existent both read as "not found here", exactly like hierarchy's
  // parent-position check.
  if (!position || position.organisation_id !== organisationId) {
    throw DepartmentError.field(
      422,
      "headPositionId",
      "That head position could not be found in this organisation.",
    );
  }

  return position.id;
}

async function requireEligibleMember(organisationId: number, memberId: number) {
  const member = await findMembershipById(organisationId, memberId);

  if (!member) {
    throw DepartmentError.field(
      404,
      "memberId",
      "That member could not be found.",
    );
  }

  if (member.status !== "active") {
    throw DepartmentError.field(
      422,
      "memberId",
      "Only an active member can be added to a department.",
    );
  }

  return member;
}

const UNIQUE_VIOLATION = "23505";

/** A raced duplicate (department, member) insert becomes a clean 409. */
function duplicateMemberConflict(error: unknown): DepartmentError | null {
  const candidate = error as { code?: string } | null;

  if (!candidate || candidate.code !== UNIQUE_VIOLATION) {
    return null;
  }

  return DepartmentError.field(
    409,
    "memberId",
    "That person is already in this department.",
  );
}

/* ------------------------------------------------------------------------
   Read — mirrors the hierarchy tree GET's authorization (STRUCTURE).
   --------------------------------------------------------------------- */

export async function listDepartments(userId: number, organisationId: number) {
  await requireStructureCapability(userId, organisationId);

  const rows = await listDepartmentSummaries(organisationId);

  return { departments: rows.map(publicDepartment) };
}

export async function getDepartmentMembers(
  userId: number,
  organisationId: number,
  departmentId: number,
) {
  await requireStructureCapability(userId, organisationId);

  await requireDepartmentInOrganisation(organisationId, departmentId);

  const rows = await listDepartmentMembers(departmentId);

  return { members: rows.map(publicDepartmentMember) };
}

/* ------------------------------------------------------------------------
   Create / update / delete — STRUCTURE capability.
   --------------------------------------------------------------------- */

export type CreateDepartmentInput = {
  name?: unknown;
  headPositionId?: unknown;
};

async function summaryOrThrow(
  organisationId: number,
  departmentId: number,
): Promise<DepartmentSummaryRow> {
  const summary = await findDepartmentSummaryById(organisationId, departmentId);

  if (!summary) {
    throw DepartmentError.field(
      404,
      "form",
      "That department could not be found.",
    );
  }

  return summary;
}

export async function createDepartment(
  userId: number,
  organisationId: number,
  input: CreateDepartmentInput,
) {
  await requireStructureCapability(userId, organisationId);

  const name = validateDepartmentName(input.name);

  if (!name.ok) {
    throw new DepartmentError(422, name.errors);
  }

  const headPositionId = await resolveHeadPosition(
    organisationId,
    input.headPositionId,
  );

  const created = await insertDepartment({
    organisationId,
    name: name.value,
    headPositionId,
  });

  const summary = await summaryOrThrow(organisationId, created.id);

  return { department: publicDepartment(summary) };
}

export type UpdateDepartmentInput = {
  name?: unknown;
  headPositionId?: unknown;
};

export async function updateDepartmentDetails(
  userId: number,
  organisationId: number,
  departmentId: number,
  input: UpdateDepartmentInput,
) {
  await requireStructureCapability(userId, organisationId);

  const existing = await requireDepartmentInOrganisation(
    organisationId,
    departmentId,
  );

  const patch: Partial<Pick<DepartmentRecord, "name" | "head_position_id">> =
    {};

  if (input.name !== undefined) {
    const name = validateDepartmentName(input.name);

    if (!name.ok) {
      throw new DepartmentError(422, name.errors);
    }

    patch.name = name.value;
  }

  if (input.headPositionId !== undefined) {
    patch.head_position_id = await resolveHeadPosition(
      organisationId,
      input.headPositionId,
    );
  }

  if (Object.keys(patch).length > 0) {
    await updateDepartment(existing.id, patch);
  }

  const summary = await summaryOrThrow(organisationId, existing.id);

  return { department: publicDepartment(summary) };
}

export async function removeDepartment(
  userId: number,
  organisationId: number,
  departmentId: number,
) {
  await requireStructureCapability(userId, organisationId);

  const existing = await requireDepartmentInOrganisation(
    organisationId,
    departmentId,
  );

  await deleteDepartment(existing.id);

  return { success: true };
}

/* ------------------------------------------------------------------------
   Membership — OCCUPANCY capability (people placement).
   --------------------------------------------------------------------- */

export type AddDepartmentMemberInput = { memberId?: unknown };

export async function addDepartmentMember(
  userId: number,
  organisationId: number,
  departmentId: number,
  input: AddDepartmentMemberInput,
) {
  await requireOccupancyCapability(userId, organisationId);

  const department = await requireDepartmentInOrganisation(
    organisationId,
    departmentId,
  );

  const memberId = validateMemberId(input.memberId);

  if (!memberId.ok) {
    throw new DepartmentError(422, memberId.errors);
  }

  const member = await requireEligibleMember(organisationId, memberId.value);

  try {
    await insertDepartmentMember(department.id, member.id);
  } catch (error) {
    throw duplicateMemberConflict(error) ?? error;
  }

  const row = await findDepartmentMember(department.id, member.id);

  if (!row) {
    throw new Error("The department member disappeared after insert.");
  }

  return { member: publicDepartmentMember(row) };
}

export async function removeDepartmentMemberFromDepartment(
  userId: number,
  organisationId: number,
  departmentId: number,
  memberId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const department = await requireDepartmentInOrganisation(
    organisationId,
    departmentId,
  );

  const removed = await deleteDepartmentMember(department.id, memberId);

  if (removed === 0) {
    throw DepartmentError.field(
      404,
      "form",
      "That person is not a member of this department.",
    );
  }

  return { success: true };
}
