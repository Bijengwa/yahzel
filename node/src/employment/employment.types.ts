import { MEMBERSHIP_STATUSES, type MembershipStatus } from "../organisation/organisation.types.js";

/**
 * An employment relationship needs exactly the states a membership already
 * has — currently working, currently paused, relationship over — so it
 * reuses `organisation_members`'s own vocabulary rather than inventing a
 * second one. See migration 018_create_employment.ts's own note.
 */
export const EMPLOYMENT_STATUSES = MEMBERSHIP_STATUSES;
export type EmploymentStatus = MembershipStatus;

export function isEmploymentStatus(value: string): value is EmploymentStatus {
  return (EMPLOYMENT_STATUSES as readonly string[]).includes(value);
}

export type EmploymentTypeOption = { value: string; label: string };

/**
 * What kind of contract this is. A small, explicit vocabulary — the same
 * shape organisation.types.ts's PARTICIPATION_TYPES already uses — kept
 * deliberately short: this is a record of what was agreed, not a legal
 * template engine.
 */
export const CONTRACT_TYPES = [
  { value: "permanent", label: "Permanent" },
  { value: "fixed_term", label: "Fixed-term" },
  { value: "probation", label: "Probation" },
  { value: "consultancy", label: "Consultancy" },
  { value: "other", label: "Other" },
] as const satisfies readonly EmploymentTypeOption[];

export type ContractType = (typeof CONTRACT_TYPES)[number]["value"];

export function isContractType(value: string): value is ContractType {
  return CONTRACT_TYPES.some((option) => option.value === value);
}

export function contractTypeLabel(value: string): string {
  return CONTRACT_TYPES.find((option) => option.value === value)?.label ?? value;
}

/**
 * A contract's own lifecycle: it is either the one currently in force, or it
 * has ended (see migration 018's active-per-employment-record unique index).
 * Replacing a contract ends the old one and creates a new one — the history
 * stays in the ended row rather than being overwritten.
 */
export const CONTRACT_STATUSES = ["active", "ended"] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export function isContractStatus(value: string): value is ContractStatus {
  return (CONTRACT_STATUSES as readonly string[]).includes(value);
}
