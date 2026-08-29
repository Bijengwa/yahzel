/**
 * The three rows behind the Organisation area, mirroring migrations 004
 * and 005.
 *
 * A membership deliberately carries four independent columns that nothing in
 * Yahzel may infer from one another:
 *
 *   system_role         — Yahzel access (admin | member).
 *   organisation_class  — the organisation's leadership class
 *                         (administration | member). Not the same idea as
 *                         system_role "admin".
 *   designation         — the position held inside that class; "head" is the
 *                         highest-ranking one.
 *   title               — whatever the organisation itself calls the person.
 */

export const ORGANISATIONS_TABLE = "organisations";
export const ORGANISATION_MEMBERS_TABLE = "organisation_members";
export const ORGANISATION_INVITATIONS_TABLE = "organisation_invitations";

export type OrganisationRecord = {
  id: number;
  name: string;
  type: string;
  country: string | null;
  description: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
};

export type OrganisationMemberRecord = {
  id: number;
  organisation_id: number;

  profile_id: number | null;
  email: string | null;

  system_role: string;
  participation_type: string;
  organisation_class: string;
  designation: string;
  title: string | null;

  /** active | inactive | concluded. Never deleted. */
  status: string;

  invited_by: number | null;

  /** The timeline. A null left_at on an active membership reads "Present". */
  joined_at: string | null;
  left_at: string | null;

  /** The planned end date, known up front. Required for an internship. */
  expected_end_at: string | null;

  created_at: string;
  updated_at: string;
};

export type OrganisationInvitationRecord = {
  id: number;
  organisation_id: number;

  /** Null until the invited person has a Yahzel account. */
  profile_id: number | null;
  email: string;

  invited_by: number;

  system_role: string;
  participation_type: string;
  organisation_class: string;
  designation: string;
  title: string | null;

  /** The planned end date, known up front. Required for an internship. */
  expected_end_at: string | null;

  /** pending | accepted | declined | cancelled | expired. */
  status: string;

  expires_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A membership joined to the person it belongs to, for the People list. */
export type OrganisationMemberWithProfile = OrganisationMemberRecord & {
  full_name: string | null;
  username: string | null;
  profile_email: string | null;
  profile_picture_url: string | null;
};

/** A membership joined to the organisation it belongs to, for My participation. */
export type MembershipWithOrganisation = OrganisationMemberRecord & {
  organisation_name: string;
  organisation_type: string;
  organisation_country: string | null;
  organisation_description: string | null;
  organisation_created_at: string;
};

/**
 * An invitation joined to the organisation it is for and the person who sent
 * it — everything "Datius (Admin) from Musabe Schools invited you to join as
 * Accountant" needs, in one row.
 */
export type InvitationWithContext = OrganisationInvitationRecord & {
  organisation_name: string;
  organisation_type: string;
  organisation_country: string | null;
  organisation_description: string | null;
  organisation_created_at: string;

  inviter_full_name: string | null;
  inviter_username: string | null;

  /** The inviter's own standing in this organisation, for the wording. */
  inviter_system_role: string | null;
  inviter_title: string | null;
};
