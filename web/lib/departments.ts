import { apiRequest } from "./api";

/**
 * A department: a named grouping of people inside an organisation, optionally
 * led by one of the organisation's positions. Mirrors node/src/departments'
 * DepartmentSummary. A department is its own concept — it is neither a
 * position nor an occupancy — so it is always fetched and rendered
 * separately, and its head is referenced by positionId, never by person.
 */
export type DepartmentSummary = {
  id: number;
  organisationId: number;
  name: string;
  headPositionId: number | null;
  headPositionName: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * One person seen through a department. `memberId` is organisation_members.id
 * — the same id occupancy uses — not a Yahzel profile id.
 */
export type DepartmentMember = {
  id: number;
  memberId: number;
  profileId: number | null;
  name: string | null;
  email: string;
  designation: string;
  title: string | null;
  addedAt: string;
};

export function fetchDepartments(
  organisationId: number,
): Promise<{ departments: DepartmentSummary[] }> {
  return apiRequest(`/api/departments/${organisationId}`);
}

export type CreateDepartmentInput = {
  name: string;
  headPositionId?: number | null;
};

export function createDepartment(
  organisationId: number,
  input: CreateDepartmentInput,
): Promise<{ department: DepartmentSummary }> {
  return apiRequest(`/api/departments/${organisationId}`, {
    method: "POST",
    body: input,
  });
}

export type UpdateDepartmentInput = {
  name?: string;
  /** null clears the head position. */
  headPositionId?: number | null;
};

export function updateDepartment(
  organisationId: number,
  departmentId: number,
  input: UpdateDepartmentInput,
): Promise<{ department: DepartmentSummary }> {
  return apiRequest(`/api/departments/${organisationId}/${departmentId}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteDepartment(
  organisationId: number,
  departmentId: number,
): Promise<{ success: true }> {
  return apiRequest(`/api/departments/${organisationId}/${departmentId}`, {
    method: "DELETE",
  });
}

export function fetchDepartmentMembers(
  organisationId: number,
  departmentId: number,
): Promise<{ members: DepartmentMember[] }> {
  return apiRequest(
    `/api/departments/${organisationId}/${departmentId}/members`,
  );
}

export function addDepartmentMember(
  organisationId: number,
  departmentId: number,
  memberId: number,
): Promise<{ member: DepartmentMember }> {
  return apiRequest(
    `/api/departments/${organisationId}/${departmentId}/members`,
    { method: "POST", body: { memberId } },
  );
}

/** `memberId` is organisation_members.id. */
export function removeDepartmentMember(
  organisationId: number,
  departmentId: number,
  memberId: number,
): Promise<{ success: true }> {
  return apiRequest(
    `/api/departments/${organisationId}/${departmentId}/members/${memberId}`,
    { method: "DELETE" },
  );
}
