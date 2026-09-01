import { apiRequest } from "./api";

/**
 * Mirrors node/src/employment's publicEmploymentRecord/publicContract. An
 * employment record never carries a position or department of its own — see
 * migration 018_create_employment.ts — so `placement` is read-only,
 * derived from the existing occupancy/department data the org chart and
 * Departments panel already show.
 */
export type EmploymentRecord = {
  id: number;
  organisationId: number;
  memberId: number;
  /** active | inactive | concluded */
  employmentStatus: string;
  isCurrent: boolean;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Contract = {
  id: number;
  employmentRecordId: number;
  contractType: string;
  contractTypeLabel: string;
  /** active | ended */
  status: string;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CurrentPlacement = {
  position: { id: number; name: string } | null;
  departments: { id: number; name: string }[];
};

export type EmploymentForMember = {
  memberId: number;
  employmentRecord: EmploymentRecord | null;
  history: EmploymentRecord[];
  placement: CurrentPlacement;
};

export function fetchEmploymentForMember(
  organisationId: number,
  memberId: number,
): Promise<EmploymentForMember> {
  return apiRequest(`/api/employment/${organisationId}/members/${memberId}`);
}

export type CreateEmploymentInput = {
  employmentStatus?: string;
  startDate: string;
  notes?: string | null;
};

export function createEmploymentRecord(
  organisationId: number,
  memberId: number,
  input: CreateEmploymentInput,
): Promise<{ message: string; employmentRecord: EmploymentRecord }> {
  return apiRequest(`/api/employment/${organisationId}/members/${memberId}`, {
    method: "POST",
    body: input,
  });
}

export type UpdateEmploymentInput = {
  employmentStatus?: string;
  /** null clears it. */
  endDate?: string | null;
  notes?: string | null;
};

export function updateEmploymentRecord(
  organisationId: number,
  employmentId: number,
  input: UpdateEmploymentInput,
): Promise<{ message: string; employmentRecord: EmploymentRecord }> {
  return apiRequest(`/api/employment/${organisationId}/${employmentId}`, {
    method: "PATCH",
    body: input,
  });
}

export function fetchContracts(
  organisationId: number,
  employmentId: number,
): Promise<{ employmentRecordId: number; contracts: Contract[] }> {
  return apiRequest(`/api/employment/${organisationId}/${employmentId}/contracts`);
}

export type CreateContractInput = {
  contractType?: string;
  startDate: string;
  endDate?: string | null;
};

export function createContract(
  organisationId: number,
  employmentId: number,
  input: CreateContractInput,
): Promise<{ message: string; contract: Contract }> {
  return apiRequest(`/api/employment/${organisationId}/${employmentId}/contracts`, {
    method: "POST",
    body: input,
  });
}

export type UpdateContractInput = {
  contractType?: string;
  endDate?: string | null;
  /** active | ended */
  status?: string;
};

export function updateContract(
  organisationId: number,
  employmentId: number,
  contractId: number,
  input: UpdateContractInput,
): Promise<{ message: string; contract: Contract }> {
  return apiRequest(
    `/api/employment/${organisationId}/${employmentId}/contracts/${contractId}`,
    { method: "PATCH", body: input },
  );
}

export type EmploymentTypeOption = { value: string; label: string };

export type EmploymentVocabulary = {
  contractTypes: EmploymentTypeOption[];
  employmentStatuses: string[];
};

export function loadEmploymentVocabulary(): Promise<EmploymentVocabulary> {
  return apiRequest("/api/reference/employment-types");
}

const EMPLOYMENT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  concluded: "Concluded",
};

export function employmentStatusLabel(value: string): string {
  return EMPLOYMENT_STATUS_LABELS[value] ?? value;
}

export function createContractReviewWork(
  organisationId: number,
  contractId: number,
  action: "review" | "extend" | "convert" | "end" | "renew" = "review",
) {
  return apiRequest<{ message: string; workItem: { id: number } }>(
    `/api/employment/${organisationId}/contracts/${contractId}/review-work`,
    { method: "POST", body: { action } },
  );
}
