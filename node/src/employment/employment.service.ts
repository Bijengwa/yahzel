import { listDepartmentsForMember } from "../departments/department.repository.js";
import { findPositionById } from "../hierarchy/hierarchy.repository.js";
import { findActiveOccupancyByMember } from "../hierarchy/occupancy.repository.js";
import { findMembershipById } from "../organisation/organisation.repository.js";
import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import {
  contractTypeLabel,
  type ContractStatus,
} from "./employment.types.js";
import type {
  ContractRecord,
  CurrentPlacement,
  EmploymentRecordRecord,
} from "./employment.record.js";
import {
  findActiveContractByEmploymentRecord,
  findContractById,
  findEmploymentRecordById,
  findOpenEmploymentByMember,
  insertContract,
  insertEmploymentRecord,
  listContractsByEmploymentRecord,
  listEmploymentHistoryByMember,
  updateContract as updateContractRow,
  updateEmploymentRecord as updateEmploymentRecordRow,
} from "./employment.repository.js";
import {
  checkDateOrder,
  validateContractStatus,
  validateContractType,
  validateEmploymentStatus,
  validateOptionalDate,
  validateOptionalNotes,
  validateRequiredDate,
  type FieldError,
} from "./employment.validation.js";

/**
 * Carries field-scoped messages so the browser can put each one under the
 * input that caused it — the same contract OrganisationError, HierarchyError
 * and DepartmentError already use.
 */
export class EmploymentError extends Error {
  status: number;
  errors: FieldError[];

  constructor(status: number, errors: FieldError[]) {
    super(errors[0]?.message ?? "Request failed.");
    this.status = status;
    this.errors = errors;
  }

  static field(status: number, field: string, message: string): EmploymentError {
    return new EmploymentError(status, [{ field, message }]);
  }
}

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

function publicEmploymentRecord(record: EmploymentRecordRecord) {
  return {
    id: record.id,
    organisationId: record.organisation_id,
    memberId: record.member_id,
    employmentStatus: record.employment_status,
    isCurrent: record.end_date === null,
    startDate: record.start_date,
    endDate: record.end_date,
    notes: record.notes,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function publicContract(record: ContractRecord) {
  return {
    id: record.id,
    employmentRecordId: record.employment_record_id,
    contractType: record.contract_type,
    contractTypeLabel: contractTypeLabel(record.contract_type),
    isActive: record.status === "active",
    status: record.status,
    startDate: record.start_date,
    endDate: record.end_date,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function publicPlacement(placement: CurrentPlacement) {
  return placement;
}

export type PublicEmploymentRecord = ReturnType<typeof publicEmploymentRecord>;
export type PublicContract = ReturnType<typeof publicContract>;

/* ------------------------------------------------------------------------
   Shared lookups — never leak whether a member/employment record/contract
   exists in another organisation; every failure reads as "not found", the
   same way occupancy.service.ts and department.service.ts already do.
   --------------------------------------------------------------------- */

async function requireMemberInOrganisation(organisationId: number, memberId: number) {
  const member = await findMembershipById(organisationId, memberId);

  if (!member) {
    throw EmploymentError.field(404, "form", "That person could not be found.");
  }

  return member;
}

async function requireEmploymentInOrganisation(
  organisationId: number,
  employmentId: number,
): Promise<EmploymentRecordRecord> {
  const record = await findEmploymentRecordById(employmentId);

  if (!record || record.organisation_id !== organisationId) {
    throw EmploymentError.field(
      404,
      "form",
      "That employment record could not be found.",
    );
  }

  return record;
}

async function requireContractOnRecord(
  employmentRecordId: number,
  contractId: number,
): Promise<ContractRecord> {
  const contract = await findContractById(contractId);

  if (!contract || contract.employment_record_id !== employmentRecordId) {
    throw EmploymentError.field(404, "form", "That contract could not be found.");
  }

  return contract;
}

const UNIQUE_VIOLATION = "23505";

function employmentConflict(error: unknown): EmploymentError | null {
  const candidate = error as { code?: string; constraint?: string } | null;

  if (!candidate || candidate.code !== UNIQUE_VIOLATION) {
    return null;
  }

  if (candidate.constraint === "employment_records_open_member_unique") {
    return EmploymentError.field(
      409,
      "form",
      "This person already has a current employment record.",
    );
  }

  if (candidate.constraint === "contracts_active_employment_unique") {
    return EmploymentError.field(
      409,
      "form",
      "This employment record already has an active contract. End it before adding a new one.",
    );
  }

  return null;
}

/**
 * Where somebody's current position comes from, derived from the existing
 * occupancy and department data rather than duplicated onto the employment
 * record — see migration 018's own note.
 *
 * Designation debt (Phase 3, section 5): `organisation_members.designation`/
 * `title` and the occupied position's own `name` remain two separate,
 * independent facts, exactly as Phase 1 left them. `designation`/`title` are
 * the organisation's own words for the person's standing (e.g. "head",
 * "Accountant"); `position.name` is the reporting-tree node they occupy
 * (e.g. "Finance Officer"). Nothing here merges them, renames one from the
 * other, or treats one as derived from the other — the UI shows both, side
 * by side, so this employment record is not a second source of truth for
 * either.
 */
async function currentPlacement(
  organisationId: number,
  memberId: number,
): Promise<CurrentPlacement> {
  const occupancy = await findActiveOccupancyByMember(organisationId, memberId);
  const position = occupancy ? await findPositionById(occupancy.position_id) : undefined;

  const departments = await listDepartmentsForMember(memberId);

  return {
    position: position ? { id: position.id, name: position.name } : null,
    departments: departments.map((department) => ({
      id: department.id,
      name: department.name,
    })),
  };
}

/* ------------------------------------------------------------------------
   Read — one member's employment record, its history, and their placement.
   --------------------------------------------------------------------- */

export async function getEmploymentForMember(
  userId: number,
  organisationId: number,
  memberId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const member = await requireMemberInOrganisation(organisationId, memberId);

  const [current, history, placement] = await Promise.all([
    findOpenEmploymentByMember(member.id),
    listEmploymentHistoryByMember(member.id),
    currentPlacement(organisationId, member.id),
  ]);

  return {
    memberId: member.id,
    employmentRecord: current ? publicEmploymentRecord(current) : null,
    history: history.map(publicEmploymentRecord),
    placement: publicPlacement(placement),
  };
}

/* ------------------------------------------------------------------------
   Employment record — create / update. OCCUPANCY capability, the same
   standing occupancy.service.ts and department membership already require
   for placing a real person.
   --------------------------------------------------------------------- */

export type CreateEmploymentInput = {
  employmentStatus?: unknown;
  startDate?: unknown;
  notes?: unknown;
};

export async function createEmploymentRecord(
  userId: number,
  organisationId: number,
  memberId: number,
  input: CreateEmploymentInput,
) {
  await requireOccupancyCapability(userId, organisationId);

  const member = await requireMemberInOrganisation(organisationId, memberId);

  if (member.status === "concluded") {
    throw EmploymentError.field(
      422,
      "form",
      "This person's membership has concluded. Reinstate their standing first.",
    );
  }

  const existing = await findOpenEmploymentByMember(member.id);

  if (existing) {
    throw EmploymentError.field(
      409,
      "form",
      "This person already has a current employment record.",
    );
  }

  const employmentStatus = validateEmploymentStatus(input.employmentStatus);
  const startDate = validateRequiredDate(input.startDate, "startDate");
  const notes = validateOptionalNotes(input.notes);

  const errors: FieldError[] = [employmentStatus, startDate, notes].flatMap(
    (result) => (result.ok ? [] : result.errors),
  );

  if (!employmentStatus.ok || !startDate.ok || !notes.ok) {
    throw new EmploymentError(422, errors);
  }

  let created: EmploymentRecordRecord;

  try {
    created = await insertEmploymentRecord({
      organisationId,
      memberId: member.id,
      employmentStatus: employmentStatus.value,
      startDate: startDate.value,
      notes: notes.value,
    });
  } catch (error) {
    throw employmentConflict(error) ?? error;
  }

  return {
    message: "The employment record has been created.",
    employmentRecord: publicEmploymentRecord(created),
  };
}

export type UpdateEmploymentInput = {
  employmentStatus?: unknown;
  endDate?: unknown;
  notes?: unknown;
};

export async function updateEmploymentRecordDetails(
  userId: number,
  organisationId: number,
  employmentId: number,
  input: UpdateEmploymentInput,
) {
  await requireOccupancyCapability(userId, organisationId);

  const existing = await requireEmploymentInOrganisation(organisationId, employmentId);

  const employmentStatus =
    input.employmentStatus === undefined
      ? { ok: true as const, value: existing.employment_status }
      : validateEmploymentStatus(input.employmentStatus);

  const endDate =
    input.endDate === undefined
      ? { ok: true as const, value: existing.end_date }
      : validateOptionalDate(input.endDate, "endDate");

  const notes =
    input.notes === undefined
      ? { ok: true as const, value: existing.notes }
      : validateOptionalNotes(input.notes);

  const errors: FieldError[] = [employmentStatus, endDate, notes].flatMap((result) =>
    result.ok ? [] : result.errors,
  );

  if (!employmentStatus.ok || !endDate.ok || !notes.ok) {
    throw new EmploymentError(422, errors);
  }

  // Concluding without naming a date closes the relationship today, rather
  // than leaving "concluded" with no end_date — the same default
  // occupancy.service.ts's endOccupancy uses.
  let resolvedEndDate = endDate.value;

  if (employmentStatus.value === "concluded" && resolvedEndDate === null) {
    resolvedEndDate = new Date().toISOString();
  }

  errors.push(...checkDateOrder("endDate", existing.start_date, resolvedEndDate));

  if (errors.length > 0) {
    throw new EmploymentError(422, errors);
  }

  const updated = await updateEmploymentRecordRow(existing.id, {
    employment_status: employmentStatus.value,
    end_date: resolvedEndDate,
    notes: notes.value,
  });

  return {
    message: "The employment record has been updated.",
    employmentRecord: publicEmploymentRecord(updated),
  };
}

/* ------------------------------------------------------------------------
   Contracts — list / create / end. Nested under one employment record.
   --------------------------------------------------------------------- */

export async function listEmploymentContracts(
  userId: number,
  organisationId: number,
  employmentId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const employmentRecord = await requireEmploymentInOrganisation(
    organisationId,
    employmentId,
  );

  const contracts = await listContractsByEmploymentRecord(employmentRecord.id);

  return {
    employmentRecordId: employmentRecord.id,
    contracts: contracts.map(publicContract),
  };
}

export type CreateContractInput = {
  contractType?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  status?: unknown;
};

export async function createContract(
  userId: number,
  organisationId: number,
  employmentId: number,
  input: CreateContractInput,
) {
  await requireOccupancyCapability(userId, organisationId);

  const employmentRecord = await requireEmploymentInOrganisation(
    organisationId,
    employmentId,
  );

  const existing = await findActiveContractByEmploymentRecord(employmentRecord.id);

  if (existing) {
    throw EmploymentError.field(
      409,
      "form",
      "This employment record already has an active contract. End it before adding a new one.",
    );
  }

  const contractType = validateContractType(input.contractType);
  const startDate = validateRequiredDate(input.startDate, "startDate");
  const endDate = validateOptionalDate(input.endDate, "endDate");
  const status = validateContractStatus(input.status);

  const errors: FieldError[] = [contractType, startDate, endDate, status].flatMap(
    (result) => (result.ok ? [] : result.errors),
  );

  if (!contractType.ok || !startDate.ok || !endDate.ok || !status.ok) {
    throw new EmploymentError(422, errors);
  }

  // A fixed-term contract may already carry a known future end date while
  // still being the active one — status is never inferred from end_date's
  // mere presence. Ending one without naming a date closes it today.
  const resolvedEndDate =
    status.value === "ended" && endDate.value === null
      ? new Date().toISOString()
      : endDate.value;

  errors.push(...checkDateOrder("endDate", startDate.value, resolvedEndDate));

  if (errors.length > 0) {
    throw new EmploymentError(422, errors);
  }

  let created: ContractRecord;

  try {
    created = await insertContract({
      organisationId,
      employmentRecordId: employmentRecord.id,
      contractType: contractType.value,
      startDate: startDate.value,
      endDate: resolvedEndDate,
      status: status.value,
    });
  } catch (error) {
    throw employmentConflict(error) ?? error;
  }

  return {
    message: "The contract has been created.",
    contract: publicContract(created),
  };
}

export type UpdateContractInput = {
  contractType?: unknown;
  endDate?: unknown;
  status?: unknown;
};

export async function updateContractDetails(
  userId: number,
  organisationId: number,
  employmentId: number,
  contractId: number,
  input: UpdateContractInput,
) {
  await requireOccupancyCapability(userId, organisationId);

  const employmentRecord = await requireEmploymentInOrganisation(
    organisationId,
    employmentId,
  );

  const existing = await requireContractOnRecord(employmentRecord.id, contractId);

  const contractType =
    input.contractType === undefined
      ? { ok: true as const, value: existing.contract_type }
      : validateContractType(input.contractType);

  const status: { ok: true; value: ContractStatus } | { ok: false; errors: FieldError[] } =
    input.status === undefined
      ? { ok: true, value: existing.status as ContractStatus }
      : validateContractStatus(input.status);

  const endDate =
    input.endDate === undefined
      ? { ok: true as const, value: existing.end_date }
      : validateOptionalDate(input.endDate, "endDate");

  const errors: FieldError[] = [contractType, status, endDate].flatMap((result) =>
    result.ok ? [] : result.errors,
  );

  if (!contractType.ok || !status.ok || !endDate.ok) {
    throw new EmploymentError(422, errors);
  }

  // Ending a contract without naming a date closes it today — the same
  // default employment records (and occupancy) use.
  let resolvedEndDate = endDate.value;

  if (status.value === "ended" && resolvedEndDate === null) {
    resolvedEndDate = new Date().toISOString();
  }

  errors.push(...checkDateOrder("endDate", existing.start_date, resolvedEndDate));

  if (errors.length > 0) {
    throw new EmploymentError(422, errors);
  }

  let updated: ContractRecord;

  try {
    updated = await updateContractRow(existing.id, {
      contract_type: contractType.value,
      end_date: resolvedEndDate,
      status: status.value,
    });
  } catch (error) {
    throw employmentConflict(error) ?? error;
  }

  return {
    message:
      status.value === "ended"
        ? "The contract has ended."
        : "The contract has been updated.",
    contract: publicContract(updated),
  };
}
