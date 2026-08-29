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
 *
 * "Admin" and "Administration" are different things and must never be
 * inferred from one another: an admin may sit in the Member class, and a
 * person in the Administration class may hold no Yahzel admin access at all.
 */
export const SYSTEM_ROLES = ["admin", "member"] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export function isSystemRole(value: string): value is SystemRole {
  return (SYSTEM_ROLES as readonly string[]).includes(value);
}

/**
 * How the person takes part. A relationship with an organisation is not
 * always employment, so there is one membership concept with a type rather
 * than separate employee, intern and volunteer systems.
 */
export const PARTICIPATION_TYPES = [
  { value: "employee", label: "Employment" },
  { value: "intern", label: "Internship" },
  { value: "volunteer", label: "Volunteer" },
  { value: "contractor", label: "Contract" },
  { value: "consultant", label: "Consultancy" },
  { value: "member", label: "Membership" },
  { value: "other", label: "Other" },
] as const satisfies readonly OrganisationTypeOption[];

export type ParticipationType = (typeof PARTICIPATION_TYPES)[number]["value"];

export function isParticipationType(value: string): value is ParticipationType {
  return PARTICIPATION_TYPES.some((option) => option.value === value);
}

export function participationTypeLabel(value: string): string {
  return (
    PARTICIPATION_TYPES.find((option) => option.value === value)?.label ?? value
  );
}

/**
 * The organisation's own structure, one level deep for now.
 *
 *   Organisation
 *     ├── Administration — the leadership class: the Head, managers,
 *     │                    directors, HR leadership, anyone the organisation
 *     │                    puts there.
 *     └── Member         — everybody else who takes part.
 *
 * A hierarchy tree of authority and responsibility grows out of this later;
 * Phase 1 only establishes the class so the future Work system has something
 * to hang off.
 */
export const ORGANISATION_CLASSES = [
  { value: "administration", label: "Administration" },
  { value: "member", label: "Member" },
] as const satisfies readonly OrganisationTypeOption[];

export type OrganisationClass = (typeof ORGANISATION_CLASSES)[number]["value"];

export function isOrganisationClass(value: string): value is OrganisationClass {
  return ORGANISATION_CLASSES.some((option) => option.value === value);
}

export function organisationClassLabel(value: string): string {
  return (
    ORGANISATION_CLASSES.find((option) => option.value === value)?.label ?? value
  );
}

/**
 * The position held inside the class. "head" is Yahzel's universal name for
 * the highest-ranking position — the structure, not the title. Whether that
 * person is called CEO, Founder, President, Prime Minister or Director
 * General is the organisation's decision and lives in the free-text `title`.
 *
 * Head, manager and director belong to the Administration class. "member" is
 * the absence of a special position, not a rank.
 */
export const DESIGNATIONS = [
  { value: "head", label: "Head" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
] as const satisfies readonly OrganisationTypeOption[];

export type Designation = (typeof DESIGNATIONS)[number]["value"];

export function isDesignation(value: string): value is Designation {
  return DESIGNATIONS.some((option) => option.value === value);
}

export function designationLabel(value: string): string {
  return DESIGNATIONS.find((option) => option.value === value)?.label ?? value;
}

/** Positions that only make sense inside the Administration class. */
export const ADMINISTRATION_DESIGNATIONS: readonly string[] = [
  "head",
  "director",
  "manager",
];

/**
 * Where a membership stands. Nothing here deletes history: a relationship
 * that has ended is `concluded` and keeps its joined/left dates.
 */
export const MEMBERSHIP_STATUSES = ["active", "inactive", "concluded"] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export function isMembershipStatus(value: string): value is MembershipStatus {
  return (MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

/** Invitations keep their history too — nothing here is ever deleted. */
export const INVITATION_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "cancelled",
  "expired",
] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** How long an unanswered invitation stays open. */
export const INVITATION_EXPIRY_DAYS = 30;
