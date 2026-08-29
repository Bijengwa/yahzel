import { apiRequest } from "./api";
import { formatMonthYear } from "./format";

/* ------------------------------------------------------------------------
   Shapes, mirroring what node/src/organisation serialises
   --------------------------------------------------------------------- */

export type OrganisationTypeOption = {
  value: string;
  label: string;
};

export type Organisation = {
  id: number;
  name: string;
  type: string;
  typeLabel: string;
  country: string | null;
  countryName: string | null;
  description: string | null;
  memberCount: number;
  createdAt: string;
};

/**
 * Four separate ideas, never collapsed into one:
 *
 *   systemRole         — Yahzel access. "admin" is a permission, not a job.
 *   organisationClass  — Administration or Member: the organisation's own
 *                        leadership structure. Not the same thing as admin.
 *   designation        — the position held inside that class; "head" is the
 *                        highest-ranking one.
 *   title              — what the organisation itself calls the person:
 *                        "Founder & CEO", "Accountant", "Community Volunteer".
 */
export type Membership = {
  id: number;

  systemRole: string;
  isAdmin: boolean;

  organisationClass: string;
  organisationClassLabel: string;
  isAdministration: boolean;

  designation: string;
  designationLabel: string;
  isHead: boolean;

  participationType: string;
  participationLabel: string;

  title: string | null;

  /** The planned end date, known up front. Required for an internship. */
  expectedEndAt: string | null;

  /** active | inactive | concluded */
  status: string;
  joinedAt: string | null;
  leftAt: string | null;
};

export type Participation = {
  organisation: Organisation;
  membership: Membership;
};

export type Member = Membership & {
  profileId: number | null;
  fullName: string | null;
  username: string | null;
  email: string | null;
  profilePictureUrl: string | null;
};

export type Invitation = {
  id: number;
  /** pending | accepted | declined | cancelled | expired */
  status: string;

  email: string;
  profileId: number | null;

  systemRole: string;
  organisationClass: string;
  organisationClassLabel: string;
  designation: string;
  designationLabel: string;
  participationType: string;
  participationLabel: string;
  title: string | null;
  expectedEndAt: string | null;

  invitedBy: {
    id: number;
    fullName: string | null;
    username: string | null;
    systemRole: string | null;
    title: string | null;
  };

  organisation: Organisation;

  createdAt: string;
  expiresAt: string | null;
  respondedAt: string | null;
};

/* ------------------------------------------------------------------------
   Reference data
   --------------------------------------------------------------------- */

export type OrganisationVocabulary = {
  organisationTypes: OrganisationTypeOption[];
  participationTypes: OrganisationTypeOption[];
  organisationClasses: OrganisationTypeOption[];
  designations: OrganisationTypeOption[];
};

const EMPTY_VOCABULARY: OrganisationVocabulary = {
  organisationTypes: [],
  participationTypes: [],
  organisationClasses: [],
  designations: [],
};

let vocabularyCache: OrganisationVocabulary | null = null;
let vocabularyInFlight: Promise<OrganisationVocabulary> | null = null;

/** The API owns these lists, so the pickers and the validator agree. */
export function loadOrganisationVocabulary(): Promise<OrganisationVocabulary> {
  if (vocabularyCache) {
    return Promise.resolve(vocabularyCache);
  }

  if (!vocabularyInFlight) {
    vocabularyInFlight = apiRequest<Partial<OrganisationVocabulary>>(
      "/api/reference/organisation-types",
    )
      .then((response) => {
        vocabularyCache = { ...EMPTY_VOCABULARY, ...response };
        return vocabularyCache;
      })
      .finally(() => {
        vocabularyInFlight = null;
      });
  }

  return vocabularyInFlight;
}

/* ------------------------------------------------------------------------
   Calls
   --------------------------------------------------------------------- */

export function fetchParticipation(): Promise<{
  participation: Participation[];
  invitations: Invitation[];
}> {
  return apiRequest("/api/organisations");
}

export function fetchMyInvitations(): Promise<{ invitations: Invitation[] }> {
  return apiRequest("/api/organisations/invitations");
}

export type RegisterOrganisationInput = {
  name: string;
  type: string;
  country: string | null;
  description: string | null;
};

export function registerOrganisation(
  input: RegisterOrganisationInput,
): Promise<{
  message: string;
  organisation: Organisation;
  membership: Membership;
}> {
  return apiRequest("/api/organisations", { method: "POST", body: input });
}

export function fetchOrganisation(
  id: number,
): Promise<{ organisation: Organisation; membership: Membership }> {
  return apiRequest(`/api/organisations/${id}`);
}

export function fetchOrganisationPeople(id: number): Promise<{
  members: Member[];
  administration: Member[];
  people: Member[];
}> {
  return apiRequest(`/api/organisations/${id}/members`);
}

export type InviteInput = {
  /** A Yahzel username or an email address. */
  person: string;
  title: string | null;
  systemRole: string;
  organisationClass: string;
  participationType: string;
  /** Required when participationType is "intern". */
  expectedEndAt: string | null;
};

export function invitePerson(
  id: number,
  input: InviteInput,
): Promise<{ message: string; invitation: Invitation | null }> {
  return apiRequest(`/api/organisations/${id}/invitations`, {
    method: "POST",
    body: input,
  });
}

export function fetchOrganisationInvitations(
  id: number,
): Promise<{ invitations: Invitation[] }> {
  return apiRequest(`/api/organisations/${id}/invitations`);
}

export function withdrawInvitation(
  id: number,
  invitationId: number,
): Promise<{ message: string }> {
  return apiRequest(`/api/organisations/${id}/invitations/${invitationId}`, {
    method: "DELETE",
  });
}

export type StandingInput = {
  systemRole?: string;
  organisationClass?: string;
  participationType?: string;
  title?: string | null;
  expectedEndAt?: string | null;
  status?: string;
};

/** The one way somebody becomes Head, joins Administration, or is concluded. */
export function updateStanding(
  id: number,
  memberId: number,
  input: StandingInput,
): Promise<{ message: string; membership: Membership }> {
  return apiRequest(`/api/organisations/${id}/members/${memberId}`, {
    method: "PATCH",
    body: input,
  });
}

export function concludeMembership(
  id: number,
  memberId: number,
): Promise<{ message: string; membership: Membership }> {
  return apiRequest(`/api/organisations/${id}/members/${memberId}`, {
    method: "DELETE",
  });
}

export function acceptInvitation(
  invitationId: number,
): Promise<{ message: string; membership: Membership }> {
  return apiRequest(`/api/organisations/invitations/${invitationId}/accept`, {
    method: "POST",
  });
}

export function declineInvitation(
  invitationId: number,
): Promise<{ message: string }> {
  return apiRequest(`/api/organisations/invitations/${invitationId}/decline`, {
    method: "POST",
  });
}

/* ------------------------------------------------------------------------
   Wording
   --------------------------------------------------------------------- */

/**
 * How a person's standing reads. The organisation's own title wins when there
 * is one — Yahzel only falls back to its structural word when the
 * organisation has not chosen its own.
 */
export function describeStanding(membership: Membership): string {
  return membership.title || membership.organisationClassLabel;
}

/**
 * "Accountant / Employee" — the title the organisation chose, then how the
 * person takes part. Falls back to just the participation when there is no
 * title.
 */
export function describeParticipationLine(membership: Membership): string {
  return [membership.title, membership.participationLabel]
    .filter(Boolean)
    .join(" / ");
}

/**
 * "Sep 2026 — Present", "Jan 2024 — Aug 2025". An end date is never invented:
 * a membership that has not ended simply reads as continuing.
 */
export function describeTimeline(membership: Membership): string {
  const start = formatMonthYear(membership.joinedAt);

  if (!start) {
    return "";
  }

  if (membership.status === "concluded") {
    const end = formatMonthYear(membership.leftAt);

    return end ? `${start} — ${end}` : `${start} —`;
  }

  return membership.status === "active" ? `${start} — Present` : `${start} —`;
}

/** ACTIVE / INACTIVE / CONCLUDED, as the cards show it. */
export function statusLabel(status: string): string {
  return status.toUpperCase();
}

/**
 * "Datius (Admin) from Musabe Schools invited you to join as Accountant."
 * Admin is named as the Yahzel access role it is, never as a job.
 */
export function describeInviter(invitation: Invitation): string {
  const name = invitation.invitedBy.fullName ?? "Someone";

  const standing = [
    invitation.invitedBy.title,
    invitation.invitedBy.systemRole === "admin" ? "Admin" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return standing ? `${name} (${standing})` : name;
}
