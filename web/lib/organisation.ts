import { apiRequest } from "./api";

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
 * Three separate ideas, never collapsed into one:
 *
 *   systemRole  — Yahzel access. "admin" is a system role, not a job.
 *   designation — position in the organisation's structure. "head" is the
 *                 universal highest-ranking designation.
 *   title       — what the organisation itself calls the person, in their own
 *                 words: "Founder & CEO", "President", "Director General".
 */
export type Membership = {
  id: number;
  systemRole: string;
  designation: string;
  isHead: boolean;
  isAdmin: boolean;
  title: string | null;
  status: string;
  invitedAt: string;
  joinedAt: string | null;
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

/* ------------------------------------------------------------------------
   Reference data
   --------------------------------------------------------------------- */

let typeCache: OrganisationTypeOption[] | null = null;
let typesInFlight: Promise<OrganisationTypeOption[]> | null = null;

/** The API owns the type list, so the picker and the validator agree. */
export function loadOrganisationTypes(): Promise<OrganisationTypeOption[]> {
  if (typeCache) {
    return Promise.resolve(typeCache);
  }

  if (!typesInFlight) {
    typesInFlight = apiRequest<{ organisationTypes: OrganisationTypeOption[] }>(
      "/api/reference/organisation-types",
    )
      .then((response) => {
        typeCache = response.organisationTypes;
        return typeCache;
      })
      .finally(() => {
        typesInFlight = null;
      });
  }

  return typesInFlight;
}

/* ------------------------------------------------------------------------
   Calls
   --------------------------------------------------------------------- */

export function fetchParticipation(): Promise<{
  participation: Participation[];
}> {
  return apiRequest("/api/organisations");
}

export type RegisterOrganisationInput = {
  name: string;
  type: string;
  country: string | null;
  description: string | null;
  headTitle: string | null;
};

export function registerOrganisation(
  input: RegisterOrganisationInput,
): Promise<{ message: string; organisation: Organisation; membership: Membership }> {
  return apiRequest("/api/organisations", { method: "POST", body: input });
}

export function fetchOrganisation(
  id: number,
): Promise<{ organisation: Organisation; membership: Membership }> {
  return apiRequest(`/api/organisations/${id}`);
}

export function fetchOrganisationPeople(
  id: number,
): Promise<{ members: Member[] }> {
  return apiRequest(`/api/organisations/${id}/members`);
}

export type InviteInput = {
  email: string;
  title: string | null;
  systemRole: string;
};

export function invitePerson(
  id: number,
  input: InviteInput,
): Promise<{ message: string; member: Member }> {
  return apiRequest(`/api/organisations/${id}/members`, {
    method: "POST",
    body: input,
  });
}

export function removePerson(
  id: number,
  memberId: number,
): Promise<{ message: string }> {
  return apiRequest(`/api/organisations/${id}/members/${memberId}`, {
    method: "DELETE",
  });
}

export function acceptInvitation(
  id: number,
): Promise<{ message: string; membership: Membership }> {
  return apiRequest(`/api/organisations/${id}/membership/accept`, {
    method: "POST",
  });
}

export function declineInvitation(id: number): Promise<{ message: string }> {
  return apiRequest(`/api/organisations/${id}/membership/decline`, {
    method: "POST",
  });
}

/* ------------------------------------------------------------------------
   Wording
   --------------------------------------------------------------------- */

/**
 * How a person's standing reads in the interface. The organisation's own
 * title wins when there is one — Yahzel only falls back to its structural
 * word when the organisation has not chosen its own.
 */
export function describeStanding(membership: Membership): string {
  if (membership.title) {
    return membership.title;
  }

  return membership.isHead ? "Head" : "Member";
}
