import { db } from "../db/knex.js";
import { findProfileById } from "../profile/profile.repository.js";
import {
  findUserByEmail,
  findUserByUsername,
} from "../auth/auth.repository.js";
import { endOpenOccupanciesForMember } from "../hierarchy/occupancy.repository.js";
import { deleteDepartmentMembershipsForMember } from "../departments/department.repository.js";
import { endOpenEmploymentForMember } from "../employment/employment.repository.js";
import { findCountry } from "../shared/countries.js";
import type { ProfileRecord } from "../db/profile-record.js";
import type {
  InvitationWithContext,
  MembershipWithOrganisation,
  OrganisationInvitationRecord,
  OrganisationMemberRecord,
  OrganisationMemberWithProfile,
  OrganisationRecord,
} from "./organisation.record.js";
import {
  countActiveMembers,
  countActiveWith,
  createOrganisationWithAdmin,
  describeUniqueViolation,
  expireDueInvitations,
  findInvitationById,
  findInvitationWithContext,
  findMembership,
  findMembershipById,
  findOpenInvitation,
  findOrganisationById,
  insertInvitation,
  insertMembership,
  linkInvitationsToProfile,
  listInvitationsForPerson,
  listMembers,
  listOrganisationInvitations,
  listParticipation,
  updateInvitation,
  updateMembership,
} from "./organisation.repository.js";
import { sendInvitationEmail } from "./organisation.email.js";
import { createNotification } from "../notifications/notification.service.js";
import {
  INVITATION_EXPIRY_DAYS,
  designationLabel,
  organisationClassLabel,
  organisationTypeLabel,
  participationTypeLabel,
} from "./organisation.types.js";
import {
  checkClassAndDesignation,
  checkExpectedEndDate,
  validateDescription,
  validateDesignation,
  validateExpectedEndDate,
  validateInvitee,
  validateMembershipStatus,
  validateOrganisationClass,
  validateOrganisationCountry,
  validateOrganisationName,
  validateOrganisationType,
  validateParticipationType,
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
 * One person's standing in one organisation. Four ideas stay separate on the
 * wire exactly as they are separate in the database:
 *
 *   systemRole         — Yahzel access. "admin" is a permission, not a job.
 *   organisationClass  — Administration or Member: the organisation's own
 *                        leadership structure, unrelated to systemRole.
 *   designation        — the position held in that class; "head" is the
 *                        highest-ranking one.
 *   title              — what the organisation itself calls the person.
 */
function publicMembership(record: OrganisationMemberRecord) {
  return {
    id: record.id,

    systemRole: record.system_role,
    isAdmin: record.system_role === "admin",

    organisationClass: record.organisation_class,
    organisationClassLabel: organisationClassLabel(record.organisation_class),
    isAdministration: record.organisation_class === "administration",

    designation: record.designation,
    designationLabel: designationLabel(record.designation),
    isHead: record.designation === "head",

    participationType: record.participation_type,
    participationLabel: participationTypeLabel(record.participation_type),

    title: record.title,
    expectedEndAt: record.expected_end_at,

    status: record.status,
    joinedAt: record.joined_at,
    leftAt: record.left_at,
  };
}

function publicMember(record: OrganisationMemberWithProfile) {
  return {
    ...publicMembership(record),
    profileId: record.profile_id,
    fullName: record.full_name,
    username: record.username,
    email: record.profile_email ?? record.email,
    profilePictureUrl: record.profile_picture_url,
  };
}

/**
 * An invitation, with enough context to say who is asking: "Datius (Admin)
 * from Musabe Schools invited you to join as Accountant."
 */
function publicInvitation(record: InvitationWithContext) {
  return {
    id: record.id,
    status: record.status,

    email: record.email,
    profileId: record.profile_id,

    systemRole: record.system_role,
    organisationClass: record.organisation_class,
    organisationClassLabel: organisationClassLabel(record.organisation_class),
    designation: record.designation,
    designationLabel: designationLabel(record.designation),
    participationType: record.participation_type,
    participationLabel: participationTypeLabel(record.participation_type),
    title: record.title,
    expectedEndAt: record.expected_end_at,

    invitedBy: {
      id: record.invited_by,
      fullName: record.inviter_full_name,
      username: record.inviter_username,
      /** The inviter's Yahzel access role — never their job. */
      systemRole: record.inviter_system_role,
      title: record.inviter_title,
    },

    organisation: publicOrganisation(
      {
        id: record.organisation_id,
        name: record.organisation_name,
        type: record.organisation_type,
        country: record.organisation_country,
        description: record.organisation_description,
        created_at: record.organisation_created_at,
      },
      0,
    ),

    createdAt: record.created_at,
    expiresAt: record.expires_at,
    respondedAt: record.responded_at,
  };
}

export type PublicOrganisation = ReturnType<typeof publicOrganisation>;
export type PublicMembership = ReturnType<typeof publicMembership>;
export type PublicMember = ReturnType<typeof publicMember>;
export type PublicInvitation = ReturnType<typeof publicInvitation>;

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

/**
 * Yahzel access, and only that. Being in the Administration class does not
 * grant it, and holding it does not put anybody in Administration.
 */
function requireAdmin(membership: OrganisationMemberRecord): void {
  if (membership.status !== "active" || membership.system_role !== "admin") {
    throw OrganisationError.field(
      403,
      "form",
      "Only an administrator can do that.",
    );
  }
}

/**
 * STRUCTURE capability: create, rename, move or delete positions and
 * departments — the organisation's own reporting-tree definition.
 *
 * OCCUPANCY capability (below): placing, replacing or ending a real
 * person's occupancy of a position that already exists.
 *
 * Yahzel's membership model currently distinguishes exactly one capability
 * — `system_role === "admin"` — so both resolve to the identical check
 * today. They are kept as two named exports rather than one shared call, so
 * a future genuinely distinct capability (its own column, its own rule —
 * e.g. an HR-only standing that cannot touch the reporting tree, or vice
 * versa) can replace just one of them without touching every call site that
 * only needed the other. This is deliberately not a new role/permission
 * framework; it is the existing admin check, named for where each is used.
 */
export async function requireStructureCapability(
  userId: number,
  organisationId: number,
): Promise<OrganisationMemberRecord> {
  const { membership } = await requireMembership(userId, organisationId);

  requireAdmin(membership);

  return membership;
}

/** See requireStructureCapability's note — identical rule, kept separate on purpose. */
export async function requireOccupancyCapability(
  userId: number,
  organisationId: number,
): Promise<OrganisationMemberRecord> {
  const { membership } = await requireMembership(userId, organisationId);

  requireAdmin(membership);

  return membership;
}

/* ------------------------------------------------------------------------
   My participation
   --------------------------------------------------------------------- */

/**
 * Everything the signed-in person takes part in — including relationships
 * that have concluded, because that history is what the profile shows — plus
 * the invitations still waiting for an answer.
 */
export async function listMyParticipation(userId: number) {
  const profile = await requireProfile(userId);

  await expireDueInvitations();

  const rows = await listParticipation(userId);

  const counts = await countActiveMembers(
    rows.map((row) => row.organisation_id),
  );

  const invitations = await listInvitationsForPerson(userId, profile.email);

  return {
    participation: rows.map((row: MembershipWithOrganisation) => ({
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
    })),
    invitations: invitations.map(publicInvitation),
  };
}

/** Just the open invitations, for anywhere that only needs those. */
export async function listMyInvitations(userId: number) {
  const profile = await requireProfile(userId);

  await expireDueInvitations();

  return {
    invitations: (await listInvitationsForPerson(userId, profile.email)).map(
      publicInvitation,
    ),
  };
}

/* ------------------------------------------------------------------------
   Registration
   --------------------------------------------------------------------- */

export type RegisterInput = {
  name?: unknown;
  type?: unknown;
  country?: unknown;
  description?: unknown;
  title?: unknown;
};

/**
 * Registering an organisation makes the registrant its **Admin** — a Yahzel
 * access role — and nothing else. They are not made the Head: Head is a
 * position inside the Administration class, and the organisation assigns it
 * deliberately afterwards (see updateStanding).
 *
 * The registrant's own title (what the organisation calls them, e.g.
 * "Founder & CEO") is optional and, when given, kept verbatim on their
 * membership. It is a label, never a class, designation or participation —
 * those remain the organisation's later, deliberate decisions.
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
  const title = validateTitle(input.title);

  const errors: FieldError[] = [
    name,
    type,
    country,
    description,
    title,
  ].flatMap((result) => (result.ok ? [] : result.errors));

  if (!name.ok || !type.ok || !country.ok || !description.ok || !title.ok) {
    throw new OrganisationError(422, errors);
  }

  const { organisation, membership } = await createOrganisationWithAdmin({
    name: name.value,
    type: type.value,
    country: country.value,
    description: description.value,
    title: title.value,
    createdBy: userId,
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

/**
 * The people of an organisation, split the way the organisation itself is:
 * its Administration, and everybody else.
 */
export async function getOrganisationPeople(
  userId: number,
  organisationId: number,
) {
  const { membership } = await requireMembership(userId, organisationId);

  if (membership.status === "concluded") {
    throw OrganisationError.field(
      403,
      "form",
      "Your time in this organisation has concluded.",
    );
  }

  const members = (await listMembers(organisationId)).map(publicMember);

  return {
    members,
    administration: members.filter((member) => member.isAdministration),
    people: members.filter((member) => !member.isAdministration),
  };
}

/* ------------------------------------------------------------------------
   Standing — class, position, title, participation, status
   --------------------------------------------------------------------- */

export type StandingInput = {
  systemRole?: unknown;
  organisationClass?: unknown;
  designation?: unknown;
  participationType?: unknown;
  title?: unknown;
  expectedEndAt?: unknown;
  status?: unknown;
};

/**
 * How somebody is placed in the organisation. This is the one way a person
 * becomes Head, joins the Administration, or has their relationship
 * concluded — and each of those is a separate field, never a side effect of
 * another.
 */
export async function updateStanding(
  userId: number,
  organisationId: number,
  memberId: number,
  input: StandingInput,
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

  const systemRole =
    input.systemRole === undefined
      ? { ok: true as const, value: target.system_role }
      : validateSystemRole(input.systemRole);

  const organisationClass =
    input.organisationClass === undefined
      ? { ok: true as const, value: target.organisation_class }
      : validateOrganisationClass(input.organisationClass);

  const designation =
    input.designation === undefined
      ? { ok: true as const, value: target.designation }
      : validateDesignation(input.designation);

  const participationType =
    input.participationType === undefined
      ? { ok: true as const, value: target.participation_type }
      : validateParticipationType(input.participationType);

  const title =
    input.title === undefined
      ? { ok: true as const, value: target.title }
      : validateTitle(input.title);

  const expectedEndAt =
    input.expectedEndAt === undefined
      ? { ok: true as const, value: target.expected_end_at }
      : validateExpectedEndDate(input.expectedEndAt);

  const status =
    input.status === undefined
      ? { ok: true as const, value: target.status }
      : validateMembershipStatus(input.status);

  const errors: FieldError[] = [
    systemRole,
    organisationClass,
    designation,
    participationType,
    title,
    expectedEndAt,
    status,
  ].flatMap((result) => (result.ok ? [] : result.errors));

  if (
    !systemRole.ok ||
    !organisationClass.ok ||
    !designation.ok ||
    !participationType.ok ||
    !title.ok ||
    !expectedEndAt.ok ||
    !status.ok
  ) {
    throw new OrganisationError(422, errors);
  }

  errors.push(
    ...checkClassAndDesignation(organisationClass.value, designation.value),
    ...checkExpectedEndDate(participationType.value, expectedEndAt.value),
  );

  if (errors.length > 0) {
    throw new OrganisationError(422, errors);
  }

  // One organisation, one Head. Moving the position is deliberate; ending up
  // with two by accident is not.
  if (designation.value === "head" && target.designation !== "head") {
    const heads = await countActiveWith(organisationId, {
      designation: "head",
    });

    if (heads > 0) {
      throw OrganisationError.field(
        409,
        "designation",
        "This organisation already has a head. Change theirs first.",
      );
    }
  }

  // An organisation must keep somebody who can administer it.
  const losesAdmin =
    target.system_role === "admin" &&
    (systemRole.value !== "admin" || status.value !== "active");

  if (losesAdmin) {
    const admins = await countActiveWith(organisationId, {
      system_role: "admin",
    });

    if (admins <= 1) {
      throw OrganisationError.field(
        409,
        "systemRole",
        "This organisation needs at least one administrator.",
      );
    }
  }

  const timeline: Partial<OrganisationMemberRecord> = {};

  if (status.value === "concluded" && target.status !== "concluded") {
    timeline.left_at = new Date().toISOString();
  }

  // Reinstating clears the end date rather than inventing a new one.
  if (status.value !== "concluded" && target.status === "concluded") {
    timeline.left_at = null;
  }

  const updated = await updateMembership(target.id, {
    system_role: systemRole.value,
    organisation_class: organisationClass.value,
    designation: designation.value,
    participation_type: participationType.value,
    title: title.value,
    expected_end_at: expectedEndAt.value,
    status: status.value,
    ...timeline,
  });

  return {
    message: "This person's standing has been updated.",
    membership: publicMembership(updated),
  };
}

/**
 * Ends somebody's participation. The membership is never deleted — it is
 * concluded, keeps its timeline, and stays in the person's history.
 */
export async function concludeMembership(
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

  if (target.id === membership.id) {
    throw OrganisationError.field(
      409,
      "form",
      "You cannot conclude your own membership here.",
    );
  }

  if (target.status === "concluded") {
    return {
      message: "That membership has already concluded.",
      membership: publicMembership(target),
    };
  }

  if (target.system_role === "admin") {
    const admins = await countActiveWith(organisationId, {
      system_role: "admin",
    });

    if (admins <= 1) {
      throw OrganisationError.field(
        409,
        "form",
        "This organisation needs at least one administrator.",
      );
    }
  }

  // Concluding a membership is one fact with four consequences, committed
  // together: the status change, the end of any position the person still
  // occupies (history preserved — the occupancy row is ended, never deleted),
  // their removal from every department roster (department_members keeps no
  // history, so those rows are deleted; a returning member is re-added
  // trivially), and the close of any open employment record and active
  // contract (history preserved — see employment.repository.ts's
  // endOpenEmploymentForMember). All-or-nothing, so a person is never left
  // concluded yet still the active occupant of a position, on a roster, or
  // "currently employed".
  const updated = await db.transaction(async (trx) => {
    const row = await updateMembership(
      target.id,
      {
        status: "concluded",
        left_at: new Date().toISOString(),
      },
      trx,
    );

    await endOpenOccupanciesForMember(target.id, trx);
    await deleteDepartmentMembershipsForMember(target.id, trx);
    await endOpenEmploymentForMember(target.id, trx);

    return row;
  });

  return {
    message: "That membership has been concluded.",
    membership: publicMembership(updated),
  };
}

/* ------------------------------------------------------------------------
   Invitations
   --------------------------------------------------------------------- */

export type InviteInput = {
  /** A Yahzel username or an email address. */
  person?: unknown;
  /** Kept from the previous contract. */
  email?: unknown;
  title?: unknown;
  systemRole?: unknown;
  organisationClass?: unknown;
  designation?: unknown;
  participationType?: unknown;
  expectedEndAt?: unknown;
};

function invitationExpiry(): string {
  return new Date(
    Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

/**
 * Membership is the organisation's decision, which is why it is asked for
 * here and never from a task or a piece of work.
 *
 * A person may be named by Yahzel username or by email address, and the
 * address does not have to belong to an account yet: the invitation is a row
 * that waits, and registration attaches it to whoever claims that address.
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

  const invitee = validateInvitee(input.person ?? input.email);
  const title = validateTitle(input.title);
  const systemRole = validateSystemRole(input.systemRole);
  const organisationClass = validateOrganisationClass(input.organisationClass);
  const designation = validateDesignation(input.designation);
  const participationType = validateParticipationType(input.participationType);
  const expectedEndAt = validateExpectedEndDate(input.expectedEndAt);

  const errors: FieldError[] = [
    invitee,
    title,
    systemRole,
    organisationClass,
    designation,
    participationType,
    expectedEndAt,
  ].flatMap((result) => (result.ok ? [] : result.errors));

  if (
    !invitee.ok ||
    !title.ok ||
    !systemRole.ok ||
    !organisationClass.ok ||
    !designation.ok ||
    !participationType.ok ||
    !expectedEndAt.ok
  ) {
    throw new OrganisationError(422, errors);
  }

  errors.push(
    ...checkClassAndDesignation(organisationClass.value, designation.value),
    ...checkExpectedEndDate(participationType.value, expectedEndAt.value),
  );

  if (designation.value === "head") {
    const heads = await countActiveWith(organisationId, {
      designation: "head",
    });

    if (heads > 0) {
      errors.push({
        field: "designation",
        message: "This organisation already has a head.",
      });
    }
  }

  if (errors.length > 0) {
    throw new OrganisationError(422, errors);
  }

  const person =
    invitee.value.kind === "username"
      ? await findUserByUsername(invitee.value.value)
      : await findUserByEmail(invitee.value.value);

  if (invitee.value.kind === "username" && !person) {
    throw OrganisationError.field(
      404,
      "person",
      "No Yahzel account uses that username. Invite them by email instead.",
    );
  }

  const email = person?.email ?? invitee.value.value;

  if (person?.id === userId) {
    throw OrganisationError.field(
      422,
      "person",
      "You are already part of this organisation.",
    );
  }

  if (person) {
    const existing = await findMembership(organisationId, person.id);

    if (existing && existing.status !== "concluded") {
      throw OrganisationError.field(
        409,
        "person",
        "That person is already part of this organisation.",
      );
    }
  }

  if (
    await findOpenInvitation(organisationId, {
      profileId: person?.id ?? null,
      email,
    })
  ) {
    throw OrganisationError.field(
      409,
      "person",
      "That person has already been invited.",
    );
  }

  let row: OrganisationInvitationRecord;

  try {
    row = await insertInvitation({
      organisationId,
      profileId: person?.id ?? null,
      email,
      invitedBy: userId,
      systemRole: systemRole.value,
      participationType: participationType.value,
      organisationClass: organisationClass.value,
      designation: designation.value,
      title: title.value,
      expectedEndAt: expectedEndAt.value,
      expiresAt: invitationExpiry(),
    });
  } catch (error) {
    const conflict = describeUniqueViolation(error);

    if (conflict) {
      throw OrganisationError.field(409, conflict.field, conflict.message);
    }

    throw error;
  }

  const inviter = await requireProfile(userId);

  await sendInvitationEmail({
    to: email,
    organisationName: organisation.name,
    inviterName: inviter.full_name,
    inviterSystemRole: membership.system_role,
    inviterTitle: membership.title,
    title: title.value,
    participationType: participationType.value,
    organisationClass: organisationClass.value,
    registered: Boolean(person),
  });

  const invitation = await findInvitationWithContext(row.id);

  // A person with a Yahzel account gets an in-app notification they can act
  // on immediately. Somebody invited by email only, with no account yet,
  // cannot receive one — the email above is the only channel that reaches
  // them until they register (see linkInvitationsToNewProfile).
  if (person) {
    await createNotification({
      recipientProfileId: person.id,
      type: "organisation.invited",
      message: `${inviter.full_name} invited you to join ${organisation.name}.`,
      organisationId,
      invitationId: row.id,
      actionUrl: "/organisation",
    });
  }

  return {
    message: person
      ? `${person.full_name} has been invited to ${organisation.name}.`
      : `An invitation has been sent to ${email}.`,
    invitation: invitation ? publicInvitation(invitation) : null,
  };
}

/** Everything this organisation has ever sent. Admins only. */
export async function getOrganisationInvitations(
  userId: number,
  organisationId: number,
) {
  const { membership } = await requireMembership(userId, organisationId);

  requireAdmin(membership);

  await expireDueInvitations();

  return {
    invitations: (await listOrganisationInvitations(organisationId)).map(
      publicInvitation,
    ),
  };
}

/** Withdraws an unanswered invitation. The row stays, marked cancelled. */
export async function cancelInvitation(
  userId: number,
  organisationId: number,
  invitationId: number,
) {
  const { organisation, membership } = await requireMembership(
    userId,
    organisationId,
  );

  requireAdmin(membership);

  const invitation = await findInvitationById(invitationId);

  if (!invitation || invitation.organisation_id !== organisationId) {
    throw OrganisationError.field(
      404,
      "form",
      "That invitation could not be found.",
    );
  }

  if (invitation.status !== "pending") {
    throw OrganisationError.field(
      409,
      "form",
      "That invitation has already been answered.",
    );
  }

  await updateInvitation(invitation.id, {
    status: "cancelled",
    responded_at: new Date().toISOString(),
  });

  // Only a registered recipient can be reached inside Yahzel — somebody
  // invited by email alone has no notification to receive.
  if (invitation.profile_id) {
    await createNotification({
      recipientProfileId: invitation.profile_id,
      type: "organisation.invitation_cancelled",
      message: `Your invitation to join ${organisation.name} was withdrawn.`,
      organisationId: organisation.id,
      invitationId: invitation.id,
      actionUrl: "/organisation",
    });
  }

  return { message: "The invitation was withdrawn." };
}

/**
 * The caller's own unanswered invitation, whether it was addressed to their
 * profile or only to the email they later registered with.
 */
async function requireOpenInvitationFor(
  userId: number,
  match: { invitationId?: number; organisationId?: number },
): Promise<OrganisationInvitationRecord> {
  const profile = await requireProfile(userId);

  await expireDueInvitations();

  const invitation = match.invitationId
    ? await findInvitationById(match.invitationId)
    : match.organisationId
      ? await findOpenInvitation(match.organisationId, {
          profileId: userId,
          email: profile.email,
        })
      : undefined;

  const isMine =
    invitation &&
    (invitation.profile_id === userId ||
      invitation.email.toLowerCase() === profile.email.toLowerCase());

  if (!invitation || !isMine || invitation.status !== "pending") {
    throw OrganisationError.field(
      404,
      "form",
      "There is no invitation waiting for you here.",
    );
  }

  return invitation;
}

/**
 * Accepting is the moment a membership begins — never before. The person
 * joins as exactly what they were offered, and the invitation is kept as the
 * record of how they came to be here.
 */
export async function acceptInvitation(
  userId: number,
  match: { invitationId?: number; organisationId?: number },
) {
  const invitation = await requireOpenInvitationFor(userId, match);

  const existing = await findMembership(invitation.organisation_id, userId);

  const membership = existing
    ? await updateMembership(existing.id, {
        // Somebody returning to an organisation resumes on the new terms.
        system_role: invitation.system_role,
        participation_type: invitation.participation_type,
        organisation_class: invitation.organisation_class,
        designation: invitation.designation,
        title: invitation.title,
        expected_end_at: invitation.expected_end_at,
        status: "active",
        joined_at: new Date().toISOString(),
        left_at: null,
      })
    : await insertMembership({
        organisationId: invitation.organisation_id,
        profileId: userId,
        email: invitation.email,
        systemRole: invitation.system_role,
        participationType: invitation.participation_type,
        organisationClass: invitation.organisation_class,
        designation: invitation.designation,
        title: invitation.title,
        expectedEndAt: invitation.expected_end_at,
        invitedBy: invitation.invited_by,
      });

  await updateInvitation(invitation.id, {
    profile_id: userId,
    status: "accepted",
    responded_at: new Date().toISOString(),
  });

  // The organisation-side recipient is the person who sent the invitation —
  // the one contact we already have without guessing which admin should
  // hear about it.
  const organisation = await findOrganisationById(invitation.organisation_id);
  const accepter = await requireProfile(userId);

  if (organisation) {
    await createNotification({
      recipientProfileId: invitation.invited_by,
      type: "organisation.invitation_accepted",
      message: `${accepter.full_name} accepted the invitation to join ${organisation.name}.`,
      organisationId: organisation.id,
      invitationId: invitation.id,
      actionUrl: `/organisation/${organisation.id}`,
    });
  }

  return {
    message: "You are now part of this organisation.",
    membership: publicMembership(membership),
  };
}

export async function declineInvitation(
  userId: number,
  match: { invitationId?: number; organisationId?: number },
) {
  const invitation = await requireOpenInvitationFor(userId, match);

  await updateInvitation(invitation.id, {
    profile_id: userId,
    status: "declined",
    responded_at: new Date().toISOString(),
  });

  const organisation = await findOrganisationById(invitation.organisation_id);
  const decliner = await requireProfile(userId);

  if (organisation) {
    await createNotification({
      recipientProfileId: invitation.invited_by,
      type: "organisation.invitation_declined",
      message: `${decliner.full_name} declined the invitation to join ${organisation.name}.`,
      organisationId: organisation.id,
      invitationId: invitation.id,
      actionUrl: `/organisation/${organisation.id}`,
    });
  }

  return { message: "The invitation was declined." };
}

/**
 * Called once, when somebody registers: any invitation addressed to the email
 * they signed up with becomes theirs to answer.
 *
 * It is deliberately not accepted for them — registering is not consent to
 * join an organisation.
 */
export async function linkInvitationsToNewProfile(
  profileId: number,
  email: string,
): Promise<number> {
  try {
    return await linkInvitationsToProfile(profileId, email);
  } catch (error) {
    // Registration must never fail because of this.
    console.error("Failed to link invitations to a new profile:", error);
    return 0;
  }
}
