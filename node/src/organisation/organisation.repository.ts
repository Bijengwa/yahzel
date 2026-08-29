import { db } from "../db/knex.js";
import {
  ORGANISATIONS_TABLE,
  ORGANISATION_INVITATIONS_TABLE,
  ORGANISATION_MEMBERS_TABLE,
  type InvitationWithContext,
  type MembershipWithOrganisation,
  type OrganisationInvitationRecord,
  type OrganisationMemberRecord,
  type OrganisationMemberWithProfile,
  type OrganisationRecord,
} from "./organisation.record.js";

const ORGS = ORGANISATIONS_TABLE;
const MEMBERS = ORGANISATION_MEMBERS_TABLE;
const INVITATIONS = ORGANISATION_INVITATIONS_TABLE;

const ORGANISATION_COLUMNS = [
  `${ORGS}.name as organisation_name`,
  `${ORGS}.type as organisation_type`,
  `${ORGS}.country as organisation_country`,
  `${ORGS}.description as organisation_description`,
  `${ORGS}.created_at as organisation_created_at`,
];

export function findOrganisationById(id: number) {
  return db<OrganisationRecord>(ORGS).where({ id }).first();
}

/**
 * The organisation and its first membership are one fact, so they are written
 * in one transaction.
 *
 * The registrant becomes an **Admin** — a Yahzel access role — and nothing
 * more. They are deliberately *not* made the Head: Head is a position inside
 * the Administration class, and putting somebody there is the organisation's
 * own decision, made afterwards.
 */
export async function createOrganisationWithAdmin(input: {
  name: string;
  type: string;
  country: string | null;
  description: string | null;
  createdBy: number;
  participationType: string;
  title: string | null;
}): Promise<{
  organisation: OrganisationRecord;
  membership: OrganisationMemberRecord;
}> {
  return db.transaction(async (trx) => {
    const [organisation] = await trx<OrganisationRecord>(ORGS)
      .insert({
        name: input.name,
        type: input.type,
        country: input.country,
        description: input.description,
        created_by: input.createdBy,
      })
      .returning("*");

    if (!organisation) {
      throw new Error("The organisation row was not returned after insert.");
    }

    const [membership] = await trx<OrganisationMemberRecord>(MEMBERS)
      .insert({
        organisation_id: organisation.id,
        profile_id: input.createdBy,
        system_role: "admin",
        participation_type: input.participationType,
        organisation_class: "member",
        designation: "member",
        title: input.title,
        status: "active",
        joined_at: trx.fn.now() as unknown as string,
      })
      .returning("*");

    if (!membership) {
      throw new Error("The membership row was not returned after insert.");
    }

    return { organisation, membership };
  });
}

/* ------------------------------------------------------------------------
   Memberships
   --------------------------------------------------------------------- */

export function findMembership(organisationId: number, profileId: number) {
  return db<OrganisationMemberRecord>(MEMBERS)
    .where({ organisation_id: organisationId, profile_id: profileId })
    .first();
}

export function findMembershipById(organisationId: number, memberId: number) {
  return db<OrganisationMemberRecord>(MEMBERS)
    .where({ id: memberId, organisation_id: organisationId })
    .first();
}

export async function insertMembership(input: {
  organisationId: number;
  profileId: number;
  email: string | null;
  systemRole: string;
  participationType: string;
  organisationClass: string;
  designation: string;
  title: string | null;
  invitedBy: number | null;
}): Promise<OrganisationMemberRecord> {
  const [row] = await db<OrganisationMemberRecord>(MEMBERS)
    .insert({
      organisation_id: input.organisationId,
      profile_id: input.profileId,
      email: input.email,
      system_role: input.systemRole,
      participation_type: input.participationType,
      organisation_class: input.organisationClass,
      designation: input.designation,
      title: input.title,
      status: "active",
      invited_by: input.invitedBy,
      joined_at: db.fn.now() as unknown as string,
    })
    .returning("*");

  if (!row) {
    throw new Error("The membership row was not returned after insert.");
  }

  return row;
}

/**
 * Every organisation this person has ever taken part in — active, inactive
 * and concluded alike. History is what the profile's Organisations section
 * reads, so nothing is filtered out here.
 */
export function listParticipation(
  profileId: number,
): Promise<MembershipWithOrganisation[]> {
  return db(MEMBERS)
    .join(ORGS, `${ORGS}.id`, `${MEMBERS}.organisation_id`)
    .where(`${MEMBERS}.profile_id`, profileId)
    .orderBy([
      // Active first, then the timeline, newest start first.
      { column: `${MEMBERS}.status`, order: "asc" },
      { column: `${MEMBERS}.joined_at`, order: "desc" },
    ])
    .select<MembershipWithOrganisation[]>(
      `${MEMBERS}.*`,
      ...ORGANISATION_COLUMNS,
    );
}

export function listMembers(
  organisationId: number,
): Promise<OrganisationMemberWithProfile[]> {
  return db(MEMBERS)
    .leftJoin("profiles", "profiles.id", `${MEMBERS}.profile_id`)
    .where(`${MEMBERS}.organisation_id`, organisationId)
    .orderBy([
      { column: `${MEMBERS}.status`, order: "asc" },
      { column: `${MEMBERS}.created_at`, order: "asc" },
    ])
    .select<OrganisationMemberWithProfile[]>(
      `${MEMBERS}.*`,
      "profiles.full_name",
      "profiles.username",
      "profiles.email as profile_email",
      "profiles.profile_picture_url",
    );
}

/** Active-member counts for a set of organisations, in one query. */
export async function countActiveMembers(
  organisationIds: number[],
): Promise<Map<number, number>> {
  if (organisationIds.length === 0) {
    return new Map();
  }

  const rows = await db(MEMBERS)
    .whereIn("organisation_id", organisationIds)
    .where({ status: "active" })
    .groupBy("organisation_id")
    .select<{ organisation_id: number; count: string }[]>(
      "organisation_id",
      db.raw("count(*) as count"),
    );

  return new Map(rows.map((row) => [row.organisation_id, Number(row.count)]));
}

export async function updateMembership(
  id: number,
  patch: Partial<OrganisationMemberRecord>,
): Promise<OrganisationMemberRecord> {
  const [row] = await db<OrganisationMemberRecord>(MEMBERS)
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() as unknown as string })
    .returning("*");

  if (!row) {
    throw new Error(`Membership ${id} disappeared during update.`);
  }

  return row;
}

/** How many active people hold a given standing, for the last-admin guard. */
export async function countActiveWith(
  organisationId: number,
  patch: Partial<Pick<OrganisationMemberRecord, "system_role" | "designation">>,
): Promise<number> {
  const [row] = await db(MEMBERS)
    .where({ organisation_id: organisationId, status: "active", ...patch })
    .count<{ count: string }[]>("* as count");

  return Number(row?.count ?? 0);
}

/* ------------------------------------------------------------------------
   Invitations
   --------------------------------------------------------------------- */

const INVITATION_CONTEXT = [
  ...ORGANISATION_COLUMNS,
  "inviter.full_name as inviter_full_name",
  "inviter.username as inviter_username",
  "inviter_membership.system_role as inviter_system_role",
  "inviter_membership.title as inviter_title",
];

function invitationsWithContext() {
  return db(INVITATIONS)
    .join(ORGS, `${ORGS}.id`, `${INVITATIONS}.organisation_id`)
    .leftJoin("profiles as inviter", "inviter.id", `${INVITATIONS}.invited_by`)
    .leftJoin(`${MEMBERS} as inviter_membership`, (join) => {
      join
        .on("inviter_membership.profile_id", "=", `${INVITATIONS}.invited_by`)
        .andOn(
          "inviter_membership.organisation_id",
          "=",
          `${INVITATIONS}.organisation_id`,
        );
    });
}

export async function insertInvitation(input: {
  organisationId: number;
  profileId: number | null;
  email: string;
  invitedBy: number;
  systemRole: string;
  participationType: string;
  organisationClass: string;
  designation: string;
  title: string | null;
  expiresAt: string;
}): Promise<OrganisationInvitationRecord> {
  const [row] = await db<OrganisationInvitationRecord>(INVITATIONS)
    .insert({
      organisation_id: input.organisationId,
      profile_id: input.profileId,
      email: input.email,
      invited_by: input.invitedBy,
      system_role: input.systemRole,
      participation_type: input.participationType,
      organisation_class: input.organisationClass,
      designation: input.designation,
      title: input.title,
      status: "pending",
      expires_at: input.expiresAt,
    })
    .returning("*");

  if (!row) {
    throw new Error("The invitation row was not returned after insert.");
  }

  return row;
}

export function findInvitationById(id: number) {
  return db<OrganisationInvitationRecord>(INVITATIONS).where({ id }).first();
}

export function findInvitationWithContext(
  id: number,
): Promise<InvitationWithContext | undefined> {
  return invitationsWithContext()
    .where(`${INVITATIONS}.id`, id)
    .first<InvitationWithContext | undefined>(
      `${INVITATIONS}.*`,
      ...INVITATION_CONTEXT,
    );
}

/** The open invitation to one organisation for one person, if there is one. */
export function findOpenInvitation(
  organisationId: number,
  person: { profileId?: number | null; email?: string | null },
) {
  return db<OrganisationInvitationRecord>(INVITATIONS)
    .where({ organisation_id: organisationId, status: "pending" })
    .where((builder) => {
      if (person.profileId) {
        void builder.orWhere({ profile_id: person.profileId });
      }

      if (person.email) {
        void builder.orWhereRaw("lower(email) = ?", [
          person.email.toLowerCase(),
        ]);
      }
    })
    .first();
}

/** Everything ever sent by one organisation, open ones first. */
export function listOrganisationInvitations(
  organisationId: number,
): Promise<InvitationWithContext[]> {
  return invitationsWithContext()
    .where(`${INVITATIONS}.organisation_id`, organisationId)
    .orderBy([
      { column: `${INVITATIONS}.status`, order: "asc" },
      { column: `${INVITATIONS}.created_at`, order: "desc" },
    ])
    .select<InvitationWithContext[]>(`${INVITATIONS}.*`, ...INVITATION_CONTEXT);
}

/**
 * The invitations waiting for one person, matched on their profile *or* on
 * the address they were invited by before they had an account.
 */
export function listInvitationsForPerson(
  profileId: number,
  email: string,
): Promise<InvitationWithContext[]> {
  return invitationsWithContext()
    .where(`${INVITATIONS}.status`, "pending")
    .where((builder) =>
      builder
        .where(`${INVITATIONS}.profile_id`, profileId)
        .orWhereRaw(`lower(${INVITATIONS}.email) = ?`, [email.toLowerCase()]),
    )
    .orderBy(`${INVITATIONS}.created_at`, "desc")
    .select<InvitationWithContext[]>(`${INVITATIONS}.*`, ...INVITATION_CONTEXT);
}

export async function updateInvitation(
  id: number,
  patch: Partial<OrganisationInvitationRecord>,
): Promise<OrganisationInvitationRecord> {
  const [row] = await db<OrganisationInvitationRecord>(INVITATIONS)
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() as unknown as string })
    .returning("*");

  if (!row) {
    throw new Error(`Invitation ${id} disappeared during update.`);
  }

  return row;
}

/**
 * Attaches every invitation addressed to `email` to the profile that has just
 * claimed it. This is what makes the flow
 *
 *   invitation → email → register → invitation appears → accept
 *
 * work: the invitation is preserved, never auto-accepted, and simply becomes
 * visible the moment the person exists in Yahzel.
 */
export async function linkInvitationsToProfile(
  profileId: number,
  email: string,
): Promise<number> {
  return db(INVITATIONS)
    .whereNull("profile_id")
    .whereRaw("lower(email) = ?", [email.toLowerCase()])
    .update({ profile_id: profileId, updated_at: db.fn.now() });
}

/** Marks anything whose window has closed. Cheap, and keeps the row. */
export async function expireDueInvitations(): Promise<number> {
  return db(INVITATIONS)
    .where({ status: "pending" })
    .whereNotNull("expires_at")
    .where("expires_at", "<", db.fn.now())
    .update({ status: "expired", updated_at: db.fn.now() });
}

/* ------------------------------------------------------------------------
   Constraint failures
   --------------------------------------------------------------------- */

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

const CONSTRAINT_FIELDS: Record<string, { field: string; message: string }> = {
  organisation_members_org_profile_unique: {
    field: "person",
    message: "That person is already part of this organisation.",
  },
  organisation_members_org_email_unique: {
    field: "person",
    message: "That address is already part of this organisation.",
  },
  organisation_invitations_open_email_unique: {
    field: "person",
    message: "That address has already been invited.",
  },
  organisation_invitations_open_profile_unique: {
    field: "person",
    message: "That person has already been invited.",
  },
};

/**
 * Turns a raced unique-constraint failure into the same field error the
 * pre-check would have produced. Anything else is re-thrown untouched so it
 * surfaces as a 500 — a database message must never reach the browser.
 */
export function describeUniqueViolation(
  error: unknown,
): { field: string; message: string } | null {
  const candidate = error as { code?: string; constraint?: string } | null;

  if (!candidate || candidate.code !== UNIQUE_VIOLATION) {
    return null;
  }

  return (
    CONSTRAINT_FIELDS[candidate.constraint ?? ""] ?? {
      field: "form",
      message: "Those details are already in use.",
    }
  );
}
