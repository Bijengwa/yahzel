import { findProfileById } from "../profile/profile.repository.js";
import { findUserByEmail } from "../auth/auth.repository.js";
import { findCountry } from "../shared/countries.js";
import type { ProfileRecord } from "../db/profile-record.js";
import type {
  MembershipWithOrganisation,
  OrganisationMemberRecord,
  OrganisationMemberWithProfile,
  OrganisationRecord,
} from "./organisation.record.js";
import {
  countActiveMembers,
  createOrganisationWithHead,
  deleteMembership,
  describeUniqueViolation,
  findMembership,
  findMembershipById,
  findOpenInvitationByEmail,
  findOrganisationById,
  insertInvitation,
  listMembers,
  listParticipation,
  updateMembership,
} from "./organisation.repository.js";
import { organisationTypeLabel } from "./organisation.types.js";
import {
  validateDescription,
  validateEmail,
  validateOrganisationCountry,
  validateOrganisationName,
  validateOrganisationType,
  validateSystemRole,
  validateTitle,
  type FieldError,
} from "./organisation.validation.js";

/**
 * Carries field-scoped messages so the browser can put each one under the
 * input that caused it instead of dumping a single banner.
 */
export class OrganisationError extends Error {
  status: number;
  errors: FieldError[];

  constructor(status: number, errors: FieldError[]) {
    super(errors[0]?.message ?? "Request failed.");
    this.status = status;
    this.errors = errors;
  }

  static field(
    status: number,
    field: string,
    message: string,
  ): OrganisationError {
    return new OrganisationError(status, [{ field, message }]);
  }
}

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

function publicOrganisation(
  record: Pick<
    OrganisationRecord,
    "id" | "name" | "type" | "country" | "description" | "created_at"
  >,
  memberCount: number,
) {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    typeLabel: organisationTypeLabel(record.type),
    country: record.country,
    countryName: findCountry(record.country)?.name ?? null,
    description: record.description,
    memberCount,
    createdAt: record.created_at,
  };
}

/**
 * One person's standing in one organisation. The three ideas stay separate on
 * the wire exactly as they are separate in the database: `systemRole` is
 * Yahzel access, `designation` is structural position, `title` is whatever the
 * organisation itself calls the person.
 */
function publicMembership(record: OrganisationMemberRecord) {
  return {
    id: record.id,
    systemRole: record.system_role,
    designation: record.designation,
    isHead: record.designation === "head",
    isAdmin: record.system_role === "admin",
    title: record.title,
    status: record.status,
    invitedAt: record.created_at,
    joinedAt: record.joined_at,
  };
}

function publicMember(record: OrganisationMemberWithProfile) {
  return {
    ...publicMembership(record),
    profileId: record.profile_id,
    fullName: record.full_name,
    username: record.username,
    // A pending invitation has no profile behind it yet, so the address it
    // was sent to is all there is to show.
    email: record.profile_email ?? record.email,
    profilePictureUrl: record.profile_picture_url,
  };
}

export type PublicOrganisation = ReturnType<typeof publicOrganisation>;
export type PublicMembership = ReturnType<typeof publicMembership>;
export type PublicMember = ReturnType<typeof publicMember>;

/* ------------------------------------------------------------------------
   Access
   --------------------------------------------------------------------- */

async function requireProfile(userId: number): Promise<ProfileRecord> {
  const record = await findProfileById(userId);

  if (!record) {
    throw OrganisationError.field(
      404,
      "form",
      "Your profile could not be found.",
    );
  }

  return record;
}

/**
 * Resolves the caller's membership, or refuses. An organisation is not
 * public: somebody who does not belong to it is told it cannot be found
 * rather than that it exists.
 */
async function requireMembership(
  userId: number,
  organisationId: number,
): Promise<{
  organisation: OrganisationRecord;
  membership: OrganisationMemberRecord;
}> {
  const organisation = await findOrganisationById(organisationId);

  const membership = organisation
    ? await findMembership(organisationId, userId)
    : undefined;

  if (!organisation || !membership) {
    throw OrganisationError.field(
      404,
      "form",
      "That organisation could not be found.",
    );
  }

  return { organisation, membership };
}

/** Administration is an access decision, so it is made in exactly one place. */
function requireAdmin(membership: OrganisationMemberRecord): void {
  if (membership.status !== "active" || membership.system_role !== "admin") {
    throw OrganisationError.field(
      403,
      "form",
      "Only an administrator can do that.",
    );
  }
}

/* ------------------------------------------------------------------------
   My participation
   --------------------------------------------------------------------- */

export async function listMyParticipation(userId: number) {
  const profile = await requireProfile(userId);

  const rows = await listParticipation(userId, profile.email);

  const counts = await countActiveMembers(
    rows.map((row) => row.organisation_id),
  );

  return rows.map((row: MembershipWithOrganisation) => ({
    organisation: publicOrganisation(
      {
        id: row.organisation_id,
        name: row.organisation_name,
        type: row.organisation_type,
        country: row.organisation_country,
        description: row.organisation_description,
        created_at: row.organisation_created_at,
      },
      counts.get(row.organisation_id) ?? 0,
    ),
    membership: publicMembership(row),
  }));
}

/* ------------------------------------------------------------------------
   Registration
   --------------------------------------------------------------------- */

export type RegisterInput = {
  name?: unknown;
  type?: unknown;
  country?: unknown;
  description?: unknown;
  /** What this organisation calls its highest-ranking person. Free text. */
  headTitle?: unknown;
};

/**
 * Registering an organisation and becoming its first person are one act. The
 * registrant is made an admin — a Yahzel access role — whose designation is
 * head. There is no owner, and the title they typed is theirs, not Yahzel's.
 */
export async function registerOrganisation(
  userId: number,
  input: RegisterInput,
) {
  await requireProfile(userId);

  const name = validateOrganisationName(input.name);
  const type = validateOrganisationType(input.type);
  const country = validateOrganisationCountry(input.country);
  const description = validateDescription(input.description);
  const headTitle = validateTitle(input.headTitle, "headTitle");

  const errors: FieldError[] = [
    name,
    type,
    country,
    description,
    headTitle,
  ].flatMap((result) => (result.ok ? [] : result.errors));

  if (!name.ok || !type.ok || !country.ok || !description.ok || !headTitle.ok) {
    throw new OrganisationError(422, errors);
  }

  const { organisation, membership } = await createOrganisationWithHead({
    name: name.value,
    type: type.value,
    country: country.value,
    description: description.value,
    createdBy: userId,
    headTitle: headTitle.value,
  });

  return {
    message: `${organisation.name} is registered.`,
    organisation: publicOrganisation(organisation, 1),
    membership: publicMembership(membership),
  };
}

/* ------------------------------------------------------------------------
   One organisation
   --------------------------------------------------------------------- */

export async function getOrganisation(userId: number, organisationId: number) {
  const { organisation, membership } = await requireMembership(
    userId,
    organisationId,
  );

  const counts = await countActiveMembers([organisation.id]);

  return {
    organisation: publicOrganisation(
      organisation,
      counts.get(organisation.id) ?? 0,
    ),
    membership: publicMembership(membership),
  };
}

export async function getOrganisationPeople(
  userId: number,
  organisationId: number,
) {
  const { membership } = await requireMembership(userId, organisationId);

  if (membership.status !== "active") {
    throw OrganisationError.field(
      403,
      "form",
      "Accept your invitation to see who is here.",
    );
  }

  return { members: (await listMembers(organisationId)).map(publicMember) };
}

/* ------------------------------------------------------------------------
   People and invitations
   --------------------------------------------------------------------- */

export type InviteInput = {
  email?: unknown;
  title?: unknown;
  systemRole?: unknown;
};

/**
 * Membership is the organisation's decision, which is why it is asked for
 * here and never from a task or a piece of work. An address with no Yahzel
 * account yet is still a valid invitation: the row waits for whoever signs in
 * with it.
 */
export async function inviteToOrganisation(
  userId: number,
  organisationId: number,
  input: InviteInput,
) {
  const { organisation, membership } = await requireMembership(
    userId,
    organisationId,
  );

  requireAdmin(membership);

  const email = validateEmail(input.email);
  const title = validateTitle(input.title);
  const systemRole = validateSystemRole(input.systemRole);

  const errors: FieldError[] = [email, title, systemRole].flatMap((result) =>
    result.ok ? [] : result.errors,
  );

  if (!email.ok || !title.ok || !systemRole.ok) {
    throw new OrganisationError(422, errors);
  }

  const invitee = await findUserByEmail(email.value);

  if (invitee?.id === userId) {
    throw OrganisationError.field(
      422,
      "email",
      "You are already part of this organisation.",
    );
  }

  if (invitee) {
    const existing = await findMembership(organisationId, invitee.id);

    if (existing) {
      throw OrganisationError.field(
        409,
        "email",
        existing.status === "active"
          ? "That person is already part of this organisation."
          : "That person has already been invited.",
      );
    }
  }

  if (await findOpenInvitationByEmail(organisationId, email.value)) {
    throw OrganisationError.field(
      409,
      "email",
      "That address has already been invited.",
    );
  }

  try {
    const row = await insertInvitation({
      organisationId,
      profileId: invitee?.id ?? null,
      email: email.value,
      systemRole: systemRole.value,
      title: title.value,
      invitedBy: userId,
    });

    return {
      message: `${email.value} has been invited to ${organisation.name}.`,
      member: publicMember({
        ...row,
        full_name: invitee?.full_name ?? null,
        username: invitee?.username ?? null,
        profile_email: invitee?.email ?? null,
        profile_picture_url: invitee?.profile_picture_url ?? null,
      }),
    };
  } catch (error) {
    const conflict = describeUniqueViolation(error);

    if (conflict) {
      throw OrganisationError.field(409, conflict.field, conflict.message);
    }

    throw error;
  }
}

/**
 * Removes a member, or withdraws an invitation nobody has answered. The head
 * cannot be removed: an organisation with no highest-ranking person is not a
 * state Yahzel should be able to reach by accident.
 */
export async function removeFromOrganisation(
  userId: number,
  organisationId: number,
  memberId: number,
) {
  const { membership } = await requireMembership(userId, organisationId);

  requireAdmin(membership);

  const target = await findMembershipById(organisationId, memberId);

  if (!target) {
    throw OrganisationError.field(
      404,
      "form",
      "That person could not be found.",
    );
  }

  if (target.designation === "head") {
    throw OrganisationError.field(
      409,
      "form",
      "The head of the organisation cannot be removed.",
    );
  }

  if (target.id === membership.id) {
    throw OrganisationError.field(
      409,
      "form",
      "You cannot remove yourself from the organisation.",
    );
  }

  await deleteMembership(target.id);

  return {
    message:
      target.status === "active"
        ? "The member was removed."
        : "The invitation was withdrawn.",
  };
}

/* ------------------------------------------------------------------------
   Answering an invitation
   --------------------------------------------------------------------- */

/**
 * The caller's unanswered invitation, whether it was addressed to their
 * profile or only to their email address.
 */
async function requireOpenInvitation(
  userId: number,
  organisationId: number,
): Promise<OrganisationMemberRecord> {
  const profile = await requireProfile(userId);

  const invitation =
    (await findMembership(organisationId, userId)) ??
    (await findOpenInvitationByEmail(organisationId, profile.email));

  if (!invitation || invitation.status !== "invited") {
    throw OrganisationError.field(
      404,
      "form",
      "There is no invitation waiting for you here.",
    );
  }

  return invitation;
}

export async function acceptInvitation(userId: number, organisationId: number) {
  const invitation = await requireOpenInvitation(userId, organisationId);

  const membership = await updateMembership(invitation.id, {
    profile_id: userId,
    status: "active",
    joined_at: new Date().toISOString(),
  });

  return {
    message: "You are now part of this organisation.",
    membership: publicMembership(membership),
  };
}

export async function declineInvitation(
  userId: number,
  organisationId: number,
) {
  const invitation = await requireOpenInvitation(userId, organisationId);

  await deleteMembership(invitation.id);

  return { message: "The invitation was declined." };
}
