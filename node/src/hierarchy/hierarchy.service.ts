import { requireStructureCapability } from "../organisation/organisation.service.js";
import type { PositionRecord } from "./hierarchy.record.js";
import {
  createPosition,
  deletePosition,
  findPositionById,
  listPositions,
  updatePosition,
} from "./hierarchy.repository.js";
import {
  validatePositionName,
  validatePositiveId,
  type FieldError,
} from "./hierarchy.validation.js";

/**
 * Carries field-scoped messages so the browser can put each one under the
 * input that caused it instead of dumping a single banner.
 */
export class HierarchyError extends Error {
  status: number;
  errors: FieldError[];

  constructor(status: number, errors: FieldError[]) {
    super(errors[0]?.message ?? "Request failed.");
    this.status = status;
    this.errors = errors;
  }

  static field(status: number, field: string, message: string): HierarchyError {
    return new HierarchyError(status, [{ field, message }]);
  }
}

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

function publicPosition(record: PositionRecord) {
  return {
    id: record.id,
    organisationId: record.organisation_id,
    name: record.name,
    parentPositionId: record.parent_position_id,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export type PublicPosition = ReturnType<typeof publicPosition>;

/* ------------------------------------------------------------------------
   Access
   --------------------------------------------------------------------- */

/**
 * This whole feature is admin tooling: viewing the structure and editing it
 * both require the same standing. The hierarchy does not gate anything a
 * plain member needs to see yet (Work still uses its own person-to-person
 * visibility, unrelated to this), so there is no reason to expose it more
 * widely before that relationship exists.
 *
 * The check itself lives in organisation.service.ts's
 * requireStructureCapability — this used to be a local copy of the same
 * logic; it is now the shared STRUCTURE capability so occupancy.service.ts's
 * OCCUPANCY capability isn't a third independent copy of it.
 */
async function requireAdminMembership(
  userId: number,
  organisationId: number,
): Promise<void> {
  await requireStructureCapability(userId, organisationId);
}

/** Walks up the parent chain from `startId`; true once `targetId` is reached. */
function isAncestor(
  byId: Map<number, PositionRecord>,
  targetId: number,
  startId: number,
): boolean {
  let current = byId.get(startId);

  while (current) {
    if (current.id === targetId) {
      return true;
    }

    current =
      current.parent_position_id !== null
        ? byId.get(current.parent_position_id)
        : undefined;
  }

  return false;
}

/** How many positions sit anywhere beneath `rootId`, for the delete message. */
function countDescendants(positions: PositionRecord[], rootId: number): number {
  const childrenByParent = new Map<number, number[]>();

  for (const row of positions) {
    if (row.parent_position_id !== null) {
      const list = childrenByParent.get(row.parent_position_id) ?? [];
      list.push(row.id);
      childrenByParent.set(row.parent_position_id, list);
    }
  }

  let count = 0;
  const stack = [...(childrenByParent.get(rootId) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === undefined) {
      continue;
    }

    count += 1;
    stack.push(...(childrenByParent.get(current) ?? []));
  }

  return count;
}

/* ------------------------------------------------------------------------
   Read
   --------------------------------------------------------------------- */

export async function getHierarchy(userId: number, organisationId: number) {
  await requireAdminMembership(userId, organisationId);

  const positions = await listPositions(organisationId);

  return { positions: positions.map(publicPosition) };
}

/* ------------------------------------------------------------------------
   Create
   --------------------------------------------------------------------- */

export type CreatePositionInput = {
  name?: unknown;
  parentPositionId?: unknown;
};

function validateOptionalParent(
  raw: unknown,
): { ok: true; value: number | null } | { ok: false; errors: FieldError[] } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  return validatePositiveId(raw, "parentPositionId");
}

export async function createHierarchyPosition(
  userId: number,
  organisationId: number,
  input: CreatePositionInput,
) {
  await requireAdminMembership(userId, organisationId);

  const name = validatePositionName(input.name);
  const parentPositionId = validateOptionalParent(input.parentPositionId);

  const errors: FieldError[] = [name, parentPositionId].flatMap((result) =>
    result.ok ? [] : result.errors,
  );

  if (!name.ok || !parentPositionId.ok) {
    throw new HierarchyError(422, errors);
  }

  if (parentPositionId.value !== null) {
    const parent = await findPositionById(parentPositionId.value);

    // Never let a position from another organisation become a parent here —
    // "not found" either way, so Organisation B's structure is never
    // revealed to Organisation A by a probing id.
    if (!parent || parent.organisation_id !== organisationId) {
      throw HierarchyError.field(
        422,
        "parentPositionId",
        "That parent position could not be found in this organisation.",
      );
    }
  }

  const created = await createPosition({
    organisationId,
    name: name.value,
    parentPositionId: parentPositionId.value,
  });

  return {
    message: `${created.name} has been added.`,
    position: publicPosition(created),
  };
}

/* ------------------------------------------------------------------------
   Update — rename and/or move
   --------------------------------------------------------------------- */

export type UpdatePositionInput = {
  name?: unknown;
  parentPositionId?: unknown;
};

export async function updateHierarchyPosition(
  userId: number,
  organisationId: number,
  positionId: number,
  input: UpdatePositionInput,
) {
  await requireAdminMembership(userId, organisationId);

  const existing = await findPositionById(positionId);

  if (!existing || existing.organisation_id !== organisationId) {
    throw HierarchyError.field(404, "form", "That position could not be found.");
  }

  const name =
    input.name === undefined
      ? { ok: true as const, value: existing.name }
      : validatePositionName(input.name);

  const changingParent = input.parentPositionId !== undefined;

  const parentPositionId = changingParent
    ? validateOptionalParent(input.parentPositionId)
    : { ok: true as const, value: existing.parent_position_id };

  const errors: FieldError[] = [name, parentPositionId].flatMap((result) =>
    result.ok ? [] : result.errors,
  );

  if (!name.ok || !parentPositionId.ok) {
    throw new HierarchyError(422, errors);
  }

  if (changingParent && parentPositionId.value !== null) {
    if (parentPositionId.value === positionId) {
      throw HierarchyError.field(
        422,
        "parentPositionId",
        "A position cannot report to itself.",
      );
    }

    const positions = await listPositions(organisationId);
    const byId = new Map(positions.map((row) => [row.id, row]));
    const parent = byId.get(parentPositionId.value);

    if (!parent) {
      throw HierarchyError.field(
        422,
        "parentPositionId",
        "That parent position could not be found in this organisation.",
      );
    }

    // Moving `positionId` under `parentPositionId` is a cycle exactly when
    // the new parent is one of `positionId`'s own descendants — walking up
    // from the candidate parent would then eventually loop back to
    // `positionId` itself.
    if (isAncestor(byId, positionId, parentPositionId.value)) {
      throw HierarchyError.field(
        422,
        "parentPositionId",
        "That would create a cycle in the hierarchy.",
      );
    }
  }

  const updated = await updatePosition(existing.id, {
    name: name.value,
    parent_position_id: parentPositionId.value,
  });

  return {
    message: "This position has been updated.",
    position: publicPosition(updated),
  };
}

/* ------------------------------------------------------------------------
   Delete
   --------------------------------------------------------------------- */

/**
 * Deletes a position and its whole subtree (see hierarchy.repository.ts —
 * the foreign key cascades). This is the chosen safe behaviour: nothing is
 * ever left orphaned with a dangling or silently-nulled parent reference,
 * and the response names exactly how many descendants went with it so the
 * frontend can make the admin confirm an action of that size before it
 * happens, rather than discovering it afterwards.
 */
export async function deleteHierarchyPosition(
  userId: number,
  organisationId: number,
  positionId: number,
) {
  await requireAdminMembership(userId, organisationId);

  const existing = await findPositionById(positionId);

  if (!existing || existing.organisation_id !== organisationId) {
    throw HierarchyError.field(404, "form", "That position could not be found.");
  }

  const positions = await listPositions(organisationId);
  const descendantCount = countDescendants(positions, positionId);

  await deletePosition(existing.id);

  return {
    message:
      descendantCount > 0
        ? `${existing.name} and ${descendantCount} sub-position${
            descendantCount === 1 ? "" : "s"
          } have been deleted.`
        : `${existing.name} has been deleted.`,
    deletedCount: descendantCount + 1,
  };
}
