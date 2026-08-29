import { db } from "../db/knex.js";
import {
  ORGANISATIONS_TABLE,
  ORGANISATION_MEMBERS_TABLE,
  type MembershipWithOrganisation,
  type OrganisationMemberRecord,
  type OrganisationMemberWithProfile,
  type OrganisationRecord,
} from "./organisation.record.js";

const ORGS = ORGANISATIONS_TABLE;
const MEMBERS = ORGANISATION_MEMBERS_TABLE;

export function findOrganisationById(id: number) {
  return db<OrganisationRecord>(ORGS).where({ id }).first();
}

/**
 * The organisation and its first membership are one fact, so they are written
 * in one transaction: whoever registers becomes an admin whose designation is
 * head, immediately and never separately.
 */
export async function createOrganisationWithHead(input: {
  name: string;
  type: string;
  country: string | null;
  description: string | null;
  createdBy: number;
  headTitle: string | null;
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
        designation: "head",
        title: input.headTitle,
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

/**
 * An unclaimed invitation addressed to `email`. This is what lets somebody be
 * invited before they have a Yahzel account: the row waits, and the person
 * finds it the moment they sign in with that address.
 */
export function findOpenInvitationByEmail(
  organisationId: number,
  email: string,
) {
  return db<OrganisationMemberRecord>(MEMBERS)
    .where({ organisation_id: organisationId, email })
    .whereNull("profile_id")
    .first();
}

/**
 * Everything the signed-in person takes part in: memberships already tied to
 * their profile, plus invitations still addressed only to their email.
 */
export function listParticipation(
  profileId: number,
  email: string,
): Promise<MembershipWithOrganisation[]> {
  return db(MEMBERS)
    .join(ORGS, `${ORGS}.id`, `${MEMBERS}.organisation_id`)
    .where((builder) =>
      builder
        .where(`${MEMBERS}.profile_id`, profileId)
        .orWhere((pending) =>
          pending.whereNull(`${MEMBERS}.profile_id`).where(`${MEMBERS}.email`, email),
        ),
    )
    .orderBy([
      { column: `${MEMBERS}.status`, order: "asc" },
      { column: `${ORGS}.name`, order: "asc" },
    ])
    .select<MembershipWithOrganisation[]>(
      `${MEMBERS}.*`,
      `${ORGS}.name as organisation_name`,
      `${ORGS}.type as organisation_type`,
      `${ORGS}.country as organisation_country`,
      `${ORGS}.description as organisation_description`,
      `${ORGS}.created_at as organisation_created_at`,
    );
}

export function listMembers(
  organisationId: number,
): Promise<OrganisationMemberWithProfile[]> {
  return db(MEMBERS)
    .leftJoin("profiles", "profiles.id", `${MEMBERS}.profile_id`)
    .where(`${MEMBERS}.organisation_id`, organisationId)
    .orderBy([
      // Head first, then active members, then anyone still to accept.
      { column: `${MEMBERS}.designation`, order: "asc" },
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

  return new Map(
    rows.map((row) => [row.organisation_id, Number(row.count)]),
  );
}

export async function insertInvitation(input: {
  organisationId: number;
  profileId: number | null;
  email: string;
  systemRole: string;
  title: string | null;
  invitedBy: number;
}): Promise<OrganisationMemberRecord> {
  const [row] = await db<OrganisationMemberRecord>(MEMBERS)
    .insert({
      organisation_id: input.organisationId,
      profile_id: input.profileId,
      email: input.email,
      system_role: input.systemRole,
      // Version 1 only ever invites plain members. The head is established
      // once, at registration.
      designation: "member",
      title: input.title,
      status: "invited",
      invited_by: input.invitedBy,
    })
    .returning("*");

  if (!row) {
    throw new Error("The invitation row was not returned after insert.");
  }

  return row;
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

export function deleteMembership(id: number): Promise<number> {
  return db(MEMBERS).where({ id }).del();
}

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

const CONSTRAINT_FIELDS: Record<string, { field: string; message: string }> = {
  organisation_members_org_profile_unique: {
    field: "email",
    message: "That person is already part of this organisation.",
  },
  organisation_members_org_email_unique: {
    field: "email",
    message: "That address has already been invited.",
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
