import type { Knex } from "knex";

import { db } from "../db/knex.js";
import {
  CONTRACTS_TABLE,
  EMPLOYMENT_RECORDS_TABLE,
  type ContractRecord,
  type EmploymentRecordRecord,
} from "./employment.record.js";

const EMPLOYMENT_RECORDS = EMPLOYMENT_RECORDS_TABLE;
const CONTRACTS = CONTRACTS_TABLE;

/**
 * Writes accept an optional `queryable` so organisation.service's
 * concludeMembership can close an open employment record and its active
 * contract in the same transaction as the membership status change — the
 * same arrangement occupancy.repository and department.repository already
 * use for that call.
 */
type Queryable = Knex | Knex.Transaction;

/* ------------------------------------------------------------------------
   Employment records
   --------------------------------------------------------------------- */

export function findEmploymentRecordById(
  id: number,
  queryable: Queryable = db,
): Promise<EmploymentRecordRecord | undefined> {
  return queryable<EmploymentRecordRecord>(EMPLOYMENT_RECORDS)
    .where({ id })
    .first();
}

/** The still-current employment record for a membership, if any. */
export function findOpenEmploymentByMember(
  memberId: number,
  queryable: Queryable = db,
): Promise<EmploymentRecordRecord | undefined> {
  return queryable<EmploymentRecordRecord>(EMPLOYMENT_RECORDS)
    .where({ member_id: memberId, end_date: null })
    .first();
}

/** Every employment record a membership has ever had, newest first. */
export function listEmploymentHistoryByMember(
  memberId: number,
): Promise<EmploymentRecordRecord[]> {
  return db<EmploymentRecordRecord>(EMPLOYMENT_RECORDS)
    .where({ member_id: memberId })
    .orderBy("start_date", "desc");
}

export async function insertEmploymentRecord(input: {
  organisationId: number;
  memberId: number;
  employmentStatus: string;
  startDate: string;
  notes: string | null;
}): Promise<EmploymentRecordRecord> {
  const [row] = await db<EmploymentRecordRecord>(EMPLOYMENT_RECORDS)
    .insert({
      organisation_id: input.organisationId,
      member_id: input.memberId,
      employment_status: input.employmentStatus,
      start_date: input.startDate,
      notes: input.notes,
    })
    .returning("*");

  if (!row) {
    throw new Error("The employment record was not returned after insert.");
  }

  return row;
}

export async function updateEmploymentRecord(
  id: number,
  patch: Partial<
    Pick<EmploymentRecordRecord, "employment_status" | "end_date" | "notes">
  >,
): Promise<EmploymentRecordRecord> {
  const [row] = await db<EmploymentRecordRecord>(EMPLOYMENT_RECORDS)
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() as unknown as string })
    .returning("*");

  if (!row) {
    throw new Error(`Employment record ${id} disappeared during update.`);
  }

  return row;
}

/** Every employment record in an organisation — Activity's feed and Person History. */
export function listEmploymentRecordsForOrganisation(
  organisationId: number,
): Promise<EmploymentRecordRecord[]> {
  return db<EmploymentRecordRecord>(EMPLOYMENT_RECORDS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");
}

/**
 * Closes whichever employment record and contract are still open for a
 * membership — used when the membership itself is concluded, so a person is
 * never left "currently employed" against a relationship that has ended.
 * History is preserved: both rows are ended, never deleted. Transaction-aware
 * so it can run in the same transaction as the membership status change, the
 * same way endOpenOccupanciesForMember already does.
 */
export async function endOpenEmploymentForMember(
  memberId: number,
  queryable: Queryable = db,
): Promise<void> {
  const open = await findOpenEmploymentByMember(memberId, queryable);

  if (!open) {
    return;
  }

  await queryable<EmploymentRecordRecord>(EMPLOYMENT_RECORDS)
    .where({ id: open.id })
    .update({
      employment_status: "concluded",
      end_date: db.fn.now(),
      updated_at: db.fn.now(),
    } as unknown as Partial<EmploymentRecordRecord>);

  await queryable<ContractRecord>(CONTRACTS)
    .where({ employment_record_id: open.id, status: "active" })
    .update({
      status: "ended",
      end_date: db.fn.now(),
      updated_at: db.fn.now(),
    } as unknown as Partial<ContractRecord>);
}

/* ------------------------------------------------------------------------
   Contracts
   --------------------------------------------------------------------- */

export function findContractById(
  id: number,
  queryable: Queryable = db,
): Promise<ContractRecord | undefined> {
  return queryable<ContractRecord>(CONTRACTS).where({ id }).first();
}

/** Every active, dated contract in an organisation — the candidate set the expiry scan checks against its notice window. */
export function listActiveContractsForOrganisation(
  organisationId: number,
): Promise<ContractRecord[]> {
  return db<ContractRecord>(CONTRACTS)
    .where({ organisation_id: organisationId, status: "active" })
    .whereNotNull("end_date");
}

export function findActiveContractByEmploymentRecord(
  employmentRecordId: number,
  queryable: Queryable = db,
): Promise<ContractRecord | undefined> {
  return queryable<ContractRecord>(CONTRACTS)
    .where({ employment_record_id: employmentRecordId, status: "active" })
    .first();
}

/** Every contract an employment record has ever had, newest first. */
export function listContractsByEmploymentRecord(
  employmentRecordId: number,
): Promise<ContractRecord[]> {
  return db<ContractRecord>(CONTRACTS)
    .where({ employment_record_id: employmentRecordId })
    .orderBy("start_date", "desc");
}

export async function insertContract(input: {
  organisationId: number;
  employmentRecordId: number;
  contractType: string;
  startDate: string;
  endDate: string | null;
  status: string;
}): Promise<ContractRecord> {
  const [row] = await db<ContractRecord>(CONTRACTS)
    .insert({
      organisation_id: input.organisationId,
      employment_record_id: input.employmentRecordId,
      contract_type: input.contractType,
      start_date: input.startDate,
      end_date: input.endDate,
      status: input.status,
    })
    .returning("*");

  if (!row) {
    throw new Error("The contract was not returned after insert.");
  }

  return row;
}

export async function updateContract(
  id: number,
  patch: Partial<Pick<ContractRecord, "contract_type" | "end_date" | "status">>,
): Promise<ContractRecord> {
  const [row] = await db<ContractRecord>(CONTRACTS)
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() as unknown as string })
    .returning("*");

  if (!row) {
    throw new Error(`Contract ${id} disappeared during update.`);
  }

  return row;
}

/** Every contract in an organisation — Activity's feed. */
export function listContractsForOrganisation(
  organisationId: number,
): Promise<ContractRecord[]> {
  return db<ContractRecord>(CONTRACTS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");
}

export function withEmploymentTransaction<T>(
  fn: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(fn);
}
