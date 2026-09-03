import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { findMembershipById } from "../organisation/organisation.repository.js";
import { createNotification } from "../notifications/notification.service.js";
import { HierarchyError } from "./hierarchy.service.js";
import { findPositionById } from "./hierarchy.repository.js";
import type { PositionRecord } from "./hierarchy.record.js";
import type { PositionOccupancyRecord } from "./occupancy.record.js";
import {
  endOccupancyRow,
  findActiveOccupancyByMember,
  findActiveOccupancyByPosition,
  insertOccupancy,
  listActiveOccupancies,
  listOccupancyHistoryByMember,
  listOccupancyHistoryByPosition,
  withOccupancyTransaction,
} from "./occupancy.repository.js";
import { validateMemberId } from "./occupancy.validation.js";

/**
 * Occupancy shares its error contract with the rest of `/api/hierarchy` —
 * see hierarchy.service.ts's HierarchyError. Reusing it here (rather than a
 * second, identical class) keeps one error shape for the one route mount
 * both features share.
 */
export { HierarchyError };

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

function publicOccupancy(record: PositionOccupancyRecord) {
  return {
    id: record.id,
    organisationId: record.organisation_id,
    positionId: record.position_id,
    memberId: record.member_id,
    startsAt: record.starts_at,
    endsAt: record.ends_at,
    isActive: record.ends_at === null,
  };
}

export type PublicOccupancy = ReturnType<typeof publicOccupancy>;

/* ------------------------------------------------------------------------
   Shared lookups — never leak whether a position/member exists in another
   organisation; every failure reads as "not found" the same way
   hierarchy.service.ts's own lookups already do.
   --------------------------------------------------------------------- */

async function requirePositionInOrganisation(
  organisationId: number,
  positionId: number,
): Promise<PositionRecord> {
  const position = await findPositionById(positionId);

  if (!position || position.organisation_id !== organisationId) {
    throw HierarchyError.field(404, "form", "That position could not be found.");
  }

  return position;
}

/**
 * The membership rules that already exist elsewhere in Yahzel: only an
 * active member of this organisation is eligible to occupy a position —
 * the same standing Work already requires of an assignee.
 */
const UNIQUE_VIOLATION = "23505";

/**
 * The partial unique indexes from migration 012 are the last line of
 * defense against a genuine race between two concurrent requests — the
 * checks above already prevent this in the ordinary sequential case, the
 * same way organisation.repository.ts's describeUniqueViolation backstops
 * insertInvitation. A constraint hit here still becomes a clean 409, never
 * a raw 500.
 */
function occupancyConflict(error: unknown): HierarchyError | null {
  const candidate = error as { code?: string; constraint?: string } | null;

  if (!candidate || candidate.code !== UNIQUE_VIOLATION) {
    return null;
  }

  if (candidate.constraint === "position_occupancies_active_position_unique") {
    return HierarchyError.field(
      409,
      "form",
      "This position already has an active occupant.",
    );
  }

  if (candidate.constraint === "position_occupancies_active_member_unique") {
    return HierarchyError.field(
      409,
      "memberId",
      "This person already occupies another position in this organisation.",
    );
  }

  return null;
}

async function requireEligibleMember(organisationId: number, memberId: number) {
  const member = await findMembershipById(organisationId, memberId);

  if (!member) {
    throw HierarchyError.field(404, "memberId", "That member could not be found.");
  }

  if (member.status !== "active") {
    throw HierarchyError.field(
      422,
      "memberId",
      "Only an active member can occupy a position.",
    );
  }

  return member;
}

/* ------------------------------------------------------------------------
   Read
   --------------------------------------------------------------------- */

/** One position's current occupant, or vacant. */
export async function getPositionOccupancy(
  userId: number,
  organisationId: number,
  positionId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const position = await requirePositionInOrganisation(organisationId, positionId);
  const current = await findActiveOccupancyByPosition(position.id);

  return {
    positionId: position.id,
    occupant: current ? publicOccupancy(current) : null,
  };
}

/** Every position's current occupant across the organisation, in one call. */
export async function listOrganisationOccupancy(
  userId: number,
  organisationId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const occupancies = await listActiveOccupancies(organisationId);

  return { occupancies: occupancies.map(publicOccupancy) };
}

/** Everyone who has ever occupied one position, newest first. */
export async function getPositionOccupancyHistory(
  userId: number,
  organisationId: number,
  positionId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const position = await requirePositionInOrganisation(organisationId, positionId);
  const history = await listOccupancyHistoryByPosition(position.id);

  return { positionId: position.id, history: history.map(publicOccupancy) };
}

/** Every position one person has ever occupied in this organisation, newest first. */
export async function getMemberOccupancyHistory(
  userId: number,
  organisationId: number,
  memberId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const member = await findMembershipById(organisationId, memberId);

  if (!member) {
    throw HierarchyError.field(404, "form", "That member could not be found.");
  }

  const history = await listOccupancyHistoryByMember(organisationId, member.id);

  return { memberId: member.id, history: history.map(publicOccupancy) };
}

/* ------------------------------------------------------------------------
   Assign — a vacant position only
   --------------------------------------------------------------------- */

export type AssignOccupantInput = { memberId?: unknown };

export async function assignOccupant(
  userId: number,
  organisationId: number,
  positionId: number,
  input: AssignOccupantInput,
) {
  await requireOccupancyCapability(userId, organisationId);

  const position = await requirePositionInOrganisation(organisationId, positionId);

  const memberId = validateMemberId(input.memberId);

  if (!memberId.ok) {
    throw new HierarchyError(422, memberId.errors);
  }

  const member = await requireEligibleMember(organisationId, memberId.value);

  const currentOccupant = await findActiveOccupancyByPosition(position.id);

  if (currentOccupant) {
    throw HierarchyError.field(
      409,
      "form",
      "This position already has an active occupant. Replace the occupant instead of assigning a new one.",
    );
  }

  const memberElsewhere = await findActiveOccupancyByMember(
    organisationId,
    member.id,
  );

  if (memberElsewhere) {
    throw HierarchyError.field(
      409,
      "memberId",
      "This person already occupies another position in this organisation.",
    );
  }

  let created;

  try {
    created = await insertOccupancy({
      organisationId,
      positionId: position.id,
      memberId: member.id,
    });
  } catch (error) {
    throw occupancyConflict(error) ?? error;
  }

  if (member.profile_id !== null) {
    await createNotification({
      recipientProfileId: member.profile_id,
      type: "hierarchy.position_assigned",
      message: `You have been placed in ${position.name}.`,
      organisationId,
      actionUrl: `/organisation/${organisationId}/hierarchy`,
    });
  }

  return {
    message: `${position.name} now has an occupant.`,
    occupancy: publicOccupancy(created),
  };
}

/* ------------------------------------------------------------------------
   Replace — ends whoever currently holds the position (if anybody), then
   assigns the new person, in one transaction.
   --------------------------------------------------------------------- */

export type ReplaceOccupantInput = { memberId?: unknown };

export async function replaceOccupant(
  userId: number,
  organisationId: number,
  positionId: number,
  input: ReplaceOccupantInput,
) {
  await requireOccupancyCapability(userId, organisationId);

  const position = await requirePositionInOrganisation(organisationId, positionId);

  const memberId = validateMemberId(input.memberId);

  if (!memberId.ok) {
    throw new HierarchyError(422, memberId.errors);
  }

  const member = await requireEligibleMember(organisationId, memberId.value);

  const result = await withOccupancyTransaction(async (trx) => {
    const currentOnPosition = await findActiveOccupancyByPosition(
      position.id,
      trx,
    );

    // Replacing a position with its own current occupant is a no-op, not
    // an error — the caller asked for "this person occupies this position"
    // and that is already true.
    if (currentOnPosition && currentOnPosition.member_id === member.id) {
      return {
        message: `${position.name} already has this occupant.`,
        occupancy: publicOccupancy(currentOnPosition),
        assigned: false,
      };
    }

    const memberElsewhere = await findActiveOccupancyByMember(
      organisationId,
      member.id,
      trx,
    );

    if (memberElsewhere) {
      throw HierarchyError.field(
        409,
        "memberId",
        "This person already occupies another position in this organisation. End that occupancy first.",
      );
    }

    if (currentOnPosition) {
      await endOccupancyRow(currentOnPosition.id, trx);
    }

    let created;

    try {
      created = await insertOccupancy(
        { organisationId, positionId: position.id, memberId: member.id },
        trx,
      );
    } catch (error) {
      throw occupancyConflict(error) ?? error;
    }

    return {
      message: `${position.name} now has a new occupant.`,
      occupancy: publicOccupancy(created),
      assigned: true,
    };
  });

  if (result.assigned && member.profile_id !== null) {
    await createNotification({
      recipientProfileId: member.profile_id,
      type: "hierarchy.position_assigned",
      message: `You have been placed in ${position.name}.`,
      organisationId,
      actionUrl: `/organisation/${organisationId}/hierarchy`,
    });
  }

  return { message: result.message, occupancy: result.occupancy };
}

/* ------------------------------------------------------------------------
   End — the position becomes vacant. History is kept, never deleted.
   --------------------------------------------------------------------- */

export async function endOccupancy(
  userId: number,
  organisationId: number,
  positionId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const position = await requirePositionInOrganisation(organisationId, positionId);

  const current = await findActiveOccupancyByPosition(position.id);

  if (!current) {
    throw HierarchyError.field(409, "form", "This position is already vacant.");
  }

  const ended = await endOccupancyRow(current.id);

  return {
    message: `${position.name} is now vacant.`,
    occupancy: publicOccupancy(ended),
  };
}
