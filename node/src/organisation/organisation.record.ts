/**
 * The two rows behind the Organisation area, mirroring migration 004.
 *
 * A membership deliberately carries three independent columns: `system_role`
 * (Yahzel access), `designation` (structural position, "head" being the
 * highest) and `title` (whatever the organisation calls the person). Nothing
 * in Yahzel may infer one from another.
 */

export const ORGANISATIONS_TABLE = "organisations";
export const ORGANISATION_MEMBERS_TABLE = "organisation_members";

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

  /** Null until an invited person with no Yahzel account claims the row. */
  profile_id: number | null;
  email: string | null;

  system_role: string;
  designation: string;
  title: string | null;
  status: string;

  invited_by: number | null;
  joined_at: string | null;
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
