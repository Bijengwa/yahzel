/**
 * The vocabulary of an organisation, owned by the API.
 *
 * The web client reads the same lists from `/api/reference/organisation-types`
 * so the picker it renders and the values this service accepts can never
 * drift apart — the arrangement `shared/countries.ts` already established.
 */

export type OrganisationTypeOption = {
  value: string;
  label: string;
};

/** What an organisation *is*. Broad on purpose: Yahzel is not only for companies. */
export const ORGANISATION_TYPES = [
  { value: "company", label: "Company" },
  { value: "ngo", label: "NGO or non-profit" },
  { value: "government", label: "Government institution" },
  { value: "agency", label: "Agency" },
  { value: "institution", label: "Institution" },
  { value: "other", label: "Other" },
] as const satisfies readonly OrganisationTypeOption[];

export type OrganisationType = (typeof ORGANISATION_TYPES)[number]["value"];

export function isOrganisationType(value: string): value is OrganisationType {
  return ORGANISATION_TYPES.some((option) => option.value === value);
}

export function organisationTypeLabel(value: string): string {
  return (
    ORGANISATION_TYPES.find((option) => option.value === value)?.label ?? value
  );
}

/**
 * What a person may do *in Yahzel*. This is an access role and nothing else —
 * it is never a job title, and it is never shown as one.
 */
export const SYSTEM_ROLES = ["admin", "member"] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export function isSystemRole(value: string): value is SystemRole {
  return (SYSTEM_ROLES as readonly string[]).includes(value);
}

/**
 * Where a person sits in the organisation's own structure.
 *
 * "head" is Yahzel's universal name for the highest-ranking position — the
 * structure, not the title. Whether that person is called CEO, Founder,
 * President, Prime Minister or Director General is the organisation's
 * decision and lives in the free-text `title` column.
 *
 * Version 1 recognises exactly two designations. The Administration area that
 * follows will add directors, managers, HR and finance as further values
 * here, which is why this is an open list rather than a boolean "is head".
 */
export const DESIGNATIONS = ["head", "member"] as const;

export type Designation = (typeof DESIGNATIONS)[number];

export const MEMBERSHIP_STATUSES = ["invited", "active"] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
