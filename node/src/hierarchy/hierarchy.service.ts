import {
  findMembership,
  findMembershipById,
  findOrganisationById,
} from "../organisation/organisation.repository.js";
import type { OrganisationMemberWithProfile } from "../organisation/organisation.record.js";
import {
  addDepartmentMember,
  countMembersByDepartmentIds,
  createDepartment as createDepartmentRow,
  deleteDepartment as deleteDepartmentRow,
  findDepartmentById,
  findDepartmentByHeadPositionId,
  findDepartmentMember,
  listDepartmentMembers,
  listDepartments,
  removeDepartmentMember,
  updateDepartment as updateDepartmentRow,
} from "./department.repository.js";
import type { DepartmentRecord } from "./department.record.js";
import type { PositionRecord } from "./hierarchy.record.js";
import {
  createPosition,
  deletePosition,
  findPositionById,
  listPositions,
  updatePosition,
} from "./hierarchy.repository.js";
import {
  validateDepartmentName,
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

function publicDepartment(
  record: DepartmentRecord,
  headPositionName: string | null,
  memberCount: number,
) {
  return {
    id: record.id,
    organisationId: record.organisation_id,
    name: record.name,
    parentPositionId: record.parent_position_id,
    headPositionId: record.head_position_id,
    headPositionName,
    memberCount,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export type PublicDepartment = ReturnType<typeof publicDepartment>;

function publicMember(record: OrganisationMemberWithProfile) {
  return {
    id: record.id,
    profileId: record.profile_id,
    fullName: record.full_name,
    username: record.username,
    email: record.profile_email ?? record.email,
    profilePictureUrl: record.profile_picture_url,
    title: record.title,
    designation: record.designation,
    status: record.status,
  };
}

/* ------------------------------------------------------------------------
   Access
   --------------------------------------------------------------------- */

/**
 * This whole feature is admin tooling: viewing the structure and editing it
 * both require the same standing. The hierarchy does not gate anything a
 * plain member needs to see yet (Work still uses its own person-to-person
 * visibility, unrelated to this), so there is no reason to expose it more
 * widely before that relationship exists.
 */
export async function requireAdminMembership(
  userId: number,
  organisationId: number,
): Promise<void> {
  const organisation = await findOrganisationById(organisationId);
  const membership = organisation
    ? await findMembership(organisationId, userId)
    : undefined;

  if (!organisation || !membership) {
    throw HierarchyError.field(
      404,
      "form",
      "That organisation could not be found.",
    );
  }

  if (membership.status !== "active" || membership.system_role !== "admin") {
    throw HierarchyError.field(
      403,
      "form",
      "Only an administrator can manage this organisation's hierarchy.",
    );
  }
}

/**
 * Walks up the parent chain from `startId`; true once `targetId` is reached.
 *
 * Reused unmodified by department.parentPositionId/headPositionId validation
 * (see createDepartment/updateDepartment below): because a department head's
 * own parent_position_id is always locked to null while it holds headship
 * (see updateHierarchyPosition's guard), a department-level cycle can only
 * ever be "the proposed parent position sits inside the proposed head
 * position's own ordinary subtree" — exactly what this plain position-only
 * check already answers. No separate merged-graph cycle detector is needed.
 */
export function isAncestor(
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

  const [positions, departments] = await Promise.all([
    listPositions(organisationId),
    listDepartments(organisationId),
  ]);

  const positionNameById = new Map(positions.map((p) => [p.id, p.name]));
  const memberCountByDepartmentId = await countMembersByDepartmentIds(
    departments.map((d) => d.id),
  );

  return {
    positions: positions.map(publicPosition),
    departments: departments.map((department) =>
      publicDepartment(
        department,
        department.head_position_id !== null
          ? (positionNameById.get(department.head_position_id) ?? null)
          : null,
        memberCountByDepartmentId.get(department.id) ?? 0,
      ),
    ),
  };
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

    // A department head's place in the tree comes from the department (see
    // createDepartment/updateDepartment below), not from its own parent
    // field — that field is locked to null for as long as headship holds, so
    // the plain position-only isAncestor check below stays correct for every
    // other move without needing to know about departments at all.
    const headedDepartment = await findDepartmentByHeadPositionId(positionId);

    if (headedDepartment) {
      throw HierarchyError.field(
        422,
        "parentPositionId",
        `This position heads ${headedDepartment.name}; its place in the tree comes from that department. Change the department instead, or remove it as head first.`,
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

  // The FK on departments.head_position_id (migration 011) sets it to null
  // automatically once this row is gone — the department survives, headless,
  // never deleted along with its head. Naming that here so the admin isn't
  // surprised by it after the fact.
  const headedDepartment = await findDepartmentByHeadPositionId(positionId);

  await deletePosition(existing.id);

  const baseMessage =
    descendantCount > 0
      ? `${existing.name} and ${descendantCount} sub-position${
          descendantCount === 1 ? "" : "s"
        } have been deleted.`
      : `${existing.name} has been deleted.`;

  return {
    message: headedDepartment
      ? `${baseMessage} ${headedDepartment.name} is now without a head.`
      : baseMessage,
    deletedCount: descendantCount + 1,
  };
}

/* ------------------------------------------------------------------------
   Departments — real hierarchy-tree nodes, distinct from the reporting tree
   of positions (see department.record.ts). A department attaches under a
   position (parentPositionId) and is led by one (headPositionId); its
   members (department_members) are never tree nodes — see
   getDepartmentDetail below for the only place they surface.
   --------------------------------------------------------------------- */

function validateOptionalPositionRef(
  raw: unknown,
  field: string,
): { ok: true; value: number | null } | { ok: false; errors: FieldError[] } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  return validatePositiveId(raw, field);
}

export type CreateDepartmentInput = {
  name?: unknown;
  parentPositionId?: unknown;
  headPositionId?: unknown;
};

export async function createDepartment(
  userId: number,
  organisationId: number,
  input: CreateDepartmentInput,
) {
  await requireAdminMembership(userId, organisationId);

  const name = validateDepartmentName(input.name);
  const parentPositionId = validateOptionalPositionRef(
    input.parentPositionId,
    "parentPositionId",
  );
  const headPositionId = validateOptionalPositionRef(
    input.headPositionId,
    "headPositionId",
  );

  const errors: FieldError[] = [name, parentPositionId, headPositionId].flatMap(
    (result) => (result.ok ? [] : result.errors),
  );

  if (!name.ok || !parentPositionId.ok || !headPositionId.ok) {
    throw new HierarchyError(422, errors);
  }

  if (parentPositionId.value !== null) {
    const parentPosition = await findPositionById(parentPositionId.value);

    if (!parentPosition || parentPosition.organisation_id !== organisationId) {
      throw HierarchyError.field(
        422,
        "parentPositionId",
        "That parent position could not be found in this organisation.",
      );
    }
  }

  let headPosition: PositionRecord | undefined;

  if (headPositionId.value !== null) {
    headPosition = await findPositionById(headPositionId.value);

    if (!headPosition || headPosition.organisation_id !== organisationId) {
      throw HierarchyError.field(
        422,
        "headPositionId",
        "That position could not be found in this organisation.",
      );
    }

    const existingHead = await findDepartmentByHeadPositionId(headPositionId.value);

    if (existingHead) {
      throw HierarchyError.field(
        422,
        "headPositionId",
        `${headPosition.name} already heads ${existingHead.name}.`,
      );
    }
  }

  if (parentPositionId.value !== null && headPositionId.value !== null) {
    if (parentPositionId.value === headPositionId.value) {
      throw HierarchyError.field(
        422,
        "parentPositionId",
        "A department cannot report to its own head position.",
      );
    }

    const positions = await listPositions(organisationId);
    const byId = new Map(positions.map((row) => [row.id, row]));

    if (isAncestor(byId, headPositionId.value, parentPositionId.value)) {
      throw HierarchyError.field(
        422,
        "parentPositionId",
        "That would create a cycle in the hierarchy.",
      );
    }
  }

  const created = await createDepartmentRow({
    organisationId,
    name: name.value,
    parentPositionId: parentPositionId.value,
    headPositionId: headPositionId.value,
  });

  // Keep "a department head's place in the tree comes only from the
  // department" true from the moment headship starts — see isAncestor's
  // docstring above for why this invariant is what keeps department cycle
  // checks reusing the plain position-only check.
  if (headPosition && headPosition.parent_position_id !== null) {
    await updatePosition(headPosition.id, { parent_position_id: null });
  }

  return {
    message: `${created.name} has been added.`,
    department: publicDepartment(created, headPosition?.name ?? null, 0),
  };
}

export type UpdateDepartmentInput = {
  name?: unknown;
  parentPositionId?: unknown;
  headPositionId?: unknown;
};

export async function updateDepartment(
  userId: number,
  organisationId: number,
  departmentId: number,
  input: UpdateDepartmentInput,
) {
  await requireAdminMembership(userId, organisationId);

  const existing = await findDepartmentById(departmentId);

  if (!existing || existing.organisation_id !== organisationId) {
    throw HierarchyError.field(404, "form", "That department could not be found.");
  }

  const name =
    input.name === undefined
      ? { ok: true as const, value: existing.name }
      : validateDepartmentName(input.name);

  const changingParent = input.parentPositionId !== undefined;
  const parentPositionId = changingParent
    ? validateOptionalPositionRef(input.parentPositionId, "parentPositionId")
    : { ok: true as const, value: existing.parent_position_id };

  const changingHead = input.headPositionId !== undefined;
  const headPositionId = changingHead
    ? validateOptionalPositionRef(input.headPositionId, "headPositionId")
    : { ok: true as const, value: existing.head_position_id };

  const errors: FieldError[] = [name, parentPositionId, headPositionId].flatMap(
    (result) => (result.ok ? [] : result.errors),
  );

  if (!name.ok || !parentPositionId.ok || !headPositionId.ok) {
    throw new HierarchyError(422, errors);
  }

  if (changingParent && parentPositionId.value !== null) {
    const parentPosition = await findPositionById(parentPositionId.value);

    if (!parentPosition || parentPosition.organisation_id !== organisationId) {
      throw HierarchyError.field(
        422,
        "parentPositionId",
        "That parent position could not be found in this organisation.",
      );
    }
  }

  let headPosition: PositionRecord | undefined;
  let headChangedToNewPosition = false;

  if (changingHead && headPositionId.value !== null) {
    headPosition = await findPositionById(headPositionId.value);

    if (!headPosition || headPosition.organisation_id !== organisationId) {
      throw HierarchyError.field(
        422,
        "headPositionId",
        "That position could not be found in this organisation.",
      );
    }

    if (headPositionId.value !== existing.head_position_id) {
      const existingHead = await findDepartmentByHeadPositionId(headPositionId.value);

      if (existingHead && existingHead.id !== departmentId) {
        throw HierarchyError.field(
          422,
          "headPositionId",
          `${headPosition.name} already heads ${existingHead.name}.`,
        );
      }

      headChangedToNewPosition = true;
    }
  }

  if (parentPositionId.value !== null && headPositionId.value !== null) {
    if (parentPositionId.value === headPositionId.value) {
      throw HierarchyError.field(
        422,
        "parentPositionId",
        "A department cannot report to its own head position.",
      );
    }

    const positions = await listPositions(organisationId);
    const byId = new Map(positions.map((row) => [row.id, row]));

    if (isAncestor(byId, headPositionId.value, parentPositionId.value)) {
      throw HierarchyError.field(
        422,
        "parentPositionId",
        "That would create a cycle in the hierarchy.",
      );
    }
  }

  const updated = await updateDepartmentRow(existing.id, {
    name: name.value,
    parent_position_id: parentPositionId.value,
    head_position_id: headPositionId.value,
  });

  if (headChangedToNewPosition && headPosition && headPosition.parent_position_id !== null) {
    await updatePosition(headPosition.id, { parent_position_id: null });
  }

  const headPositionName =
    headPositionId.value === null
      ? null
      : (headPosition ?? (await findPositionById(headPositionId.value)))?.name ?? null;

  const memberCount =
    (await countMembersByDepartmentIds([existing.id])).get(existing.id) ?? 0;

  return {
    message: "This department has been updated.",
    department: publicDepartment(updated, headPositionName, memberCount),
  };
}

export async function deleteDepartment(
  userId: number,
  organisationId: number,
  departmentId: number,
) {
  await requireAdminMembership(userId, organisationId);

  const existing = await findDepartmentById(departmentId);

  if (!existing || existing.organisation_id !== organisationId) {
    throw HierarchyError.field(404, "form", "That department could not be found.");
  }

  // department_members cascades away with it (migration 011's foreign key);
  // the head position is untouched and simply stays the root it already was
  // while it held headship — see isAncestor's docstring above.
  await deleteDepartmentRow(existing.id);

  return { message: `${existing.name} has been deleted.` };
}

export async function getDepartmentDetail(
  userId: number,
  organisationId: number,
  departmentId: number,
) {
  await requireAdminMembership(userId, organisationId);

  const existing = await findDepartmentById(departmentId);

  if (!existing || existing.organisation_id !== organisationId) {
    throw HierarchyError.field(404, "form", "That department could not be found.");
  }

  const [headPosition, members] = await Promise.all([
    existing.head_position_id !== null
      ? findPositionById(existing.head_position_id)
      : Promise.resolve(undefined),
    listDepartmentMembers(existing.id),
  ]);

  return {
    department: publicDepartment(existing, headPosition?.name ?? null, members.length),
    members: members.map(publicMember),
  };
}

export async function addDepartmentMemberToDepartment(
  userId: number,
  organisationId: number,
  departmentId: number,
  input: { memberId?: unknown },
) {
  await requireAdminMembership(userId, organisationId);

  const department = await findDepartmentById(departmentId);

  if (!department || department.organisation_id !== organisationId) {
    throw HierarchyError.field(404, "form", "That department could not be found.");
  }

  const memberId = validatePositiveId(input.memberId, "memberId");

  if (!memberId.ok) {
    throw new HierarchyError(422, memberId.errors);
  }

  const membership = await findMembershipById(organisationId, memberId.value);

  if (!membership || membership.status !== "active") {
    throw HierarchyError.field(
      422,
      "memberId",
      "That person could not be found as an active member of this organisation.",
    );
  }

  const alreadyOnRoster = await findDepartmentMember(department.id, membership.id);

  if (alreadyOnRoster) {
    throw HierarchyError.field(
      422,
      "memberId",
      "That person is already a member of this department.",
    );
  }

  await addDepartmentMember(department.id, membership.id);

  return { message: "This person has been added to the department." };
}

export async function removeDepartmentMemberFromDepartment(
  userId: number,
  organisationId: number,
  departmentId: number,
  memberId: number,
) {
  await requireAdminMembership(userId, organisationId);

  const department = await findDepartmentById(departmentId);

  if (!department || department.organisation_id !== organisationId) {
    throw HierarchyError.field(404, "form", "That department could not be found.");
  }

  await removeDepartmentMember(department.id, memberId);

  return { message: "This person has been removed from the department." };
}
