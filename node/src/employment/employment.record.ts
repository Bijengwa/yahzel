export const EMPLOYMENT_RECORDS_TABLE = "employment_records";
export const CONTRACTS_TABLE = "contracts";

/**
 * A person's employment relationship with an organisation, hung off the
 * existing `organisation_members` row rather than a second person table. See
 * migration 018_create_employment.ts for why it carries neither `position_id`
 * nor `department_id`: those come from `position_occupancies` and
 * `department_members`, joined on `member_id`, exactly as the rest of the
 * app already does.
 *
 * `end_date === null` means this relationship is still current — whether
 * `employment_status` is "active" or "inactive" — the same idiom
 * `position_occupancies.ends_at` uses. Ending a relationship sets
 * `end_date`; the row is never deleted, and a later re-hire is a new row.
 */
export type EmploymentRecordRecord = {
  id: number;
  organisation_id: number;
  member_id: number;
  /** active | inactive | concluded — organisation_members's own vocabulary. */
  employment_status: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * One contract belonging to one employment record. `status: "active"` is
 * unique per employment record (migration 018's partial index) — ending a
 * contract sets `status: "ended"`, freeing the employment record for a
 * replacement contract. History is kept: rows are never deleted.
 */
export type ContractRecord = {
  id: number;
  organisation_id: number;
  employment_record_id: number;
  /** permanent | fixed_term | probation | consultancy | other. */
  contract_type: string;
  start_date: string;
  end_date: string | null;
  /** active | ended. */
  status: string;
  created_at: string;
  updated_at: string;
};

/**
 * What the org chart already knows about a person, read (never duplicated)
 * for display alongside their employment record — see Phase 3's "Designation
 * debt" note in employment.service.ts.
 */
export type CurrentPlacement = {
  position: { id: number; name: string } | null;
  departments: { id: number; name: string }[];
};
