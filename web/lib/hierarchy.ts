import { apiRequest } from "./api";

/**
 * A bare organisational position — a name and who it reports to. Mirrors
 * node/src/hierarchy's publicPosition. Deliberately carries no occupant:
 * connecting people to positions is a separate future feature.
 */
export type Position = {
  id: number;
  organisationId: number;
  name: string;
  parentPositionId: number | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * A department: a real hierarchy-tree node distinct from a position (see
 * node/src/hierarchy/department.record.ts). It attaches under a position
 * (parentPositionId) and is led by one (headPositionId) — that position is
 * the department's only tree child; individual members are never nodes here,
 * only visible via the department detail view (fetchDepartmentDetail below).
 */
export type Department = {
  id: number;
  organisationId: number;
  name: string;
  parentPositionId: number | null;
  headPositionId: number | null;
  headPositionName: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PositionHierarchyNode = Position & {
  kind: "position";
  children: HierarchyNode[];
};

export type DepartmentHierarchyNode = Department & {
  kind: "department";
  children: HierarchyNode[];
};

export type HierarchyNode = PositionHierarchyNode | DepartmentHierarchyNode;

/**
 * The flat lists the API returns, arranged into the mixed tree the workspace
 * renders. A department's head position is always excluded from the plain
 * position-parent chain and attached under the department instead — that
 * position's own parentPositionId is locked to null by the backend for as
 * long as it holds headship (see hierarchy.service.ts's isAncestor
 * docstring), so this is a clean, unambiguous split rather than a guess.
 *
 * A position or department whose declared parent is missing from the list
 * (which the backend's own invariants should never produce) surfaces as its
 * own root rather than disappearing, so a data inconsistency stays visible.
 */
export function buildHierarchyTree(
  positions: Position[],
  departments: Department[],
): HierarchyNode[] {
  const headPositionIds = new Set(
    departments
      .filter((department) => department.headPositionId !== null)
      .map((department) => department.headPositionId as number),
  );

  const positionsById = new Map(positions.map((position) => [position.id, position]));

  const positionChildrenByParent = new Map<number, Position[]>();
  for (const position of positions) {
    if (headPositionIds.has(position.id) || position.parentPositionId === null) {
      continue;
    }

    const list = positionChildrenByParent.get(position.parentPositionId) ?? [];
    list.push(position);
    positionChildrenByParent.set(position.parentPositionId, list);
  }

  const departmentChildrenByParent = new Map<number, Department[]>();
  for (const department of departments) {
    if (department.parentPositionId === null) {
      continue;
    }

    const list = departmentChildrenByParent.get(department.parentPositionId) ?? [];
    list.push(department);
    departmentChildrenByParent.set(department.parentPositionId, list);
  }

  function buildPositionNode(position: Position): PositionHierarchyNode {
    const childDepartments = departmentChildrenByParent.get(position.id) ?? [];
    const childPositions = positionChildrenByParent.get(position.id) ?? [];

    return {
      ...position,
      kind: "position",
      children: [
        ...childDepartments.map(buildDepartmentNode),
        ...childPositions.map(buildPositionNode),
      ],
    };
  }

  function buildDepartmentNode(department: Department): DepartmentHierarchyNode {
    const headPosition =
      department.headPositionId !== null
        ? positionsById.get(department.headPositionId)
        : undefined;

    return {
      ...department,
      kind: "department",
      children: headPosition ? [buildPositionNode(headPosition)] : [],
    };
  }

  const rootPositions = positions.filter(
    (position) =>
      position.parentPositionId === null && !headPositionIds.has(position.id),
  );
  const rootDepartments = departments.filter(
    (department) => department.parentPositionId === null,
  );

  return [
    ...rootPositions.map(buildPositionNode),
    ...rootDepartments.map(buildDepartmentNode),
  ];
}

/** Every id in the subtree rooted at `positionId`, `positionId` included. */
export function collectSubtreeIds(
  positions: Position[],
  positionId: number,
): number[] {
  const childrenByParent = new Map<number, number[]>();

  for (const position of positions) {
    if (position.parentPositionId !== null) {
      const list = childrenByParent.get(position.parentPositionId) ?? [];
      list.push(position.id);
      childrenByParent.set(position.parentPositionId, list);
    }
  }

  const result: number[] = [positionId];
  const stack = [...(childrenByParent.get(positionId) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === undefined) {
      continue;
    }

    result.push(current);
    stack.push(...(childrenByParent.get(current) ?? []));
  }

  return result;
}

export function fetchHierarchy(
  organisationId: number,
): Promise<{ positions: Position[]; departments: Department[] }> {
  return apiRequest(`/api/hierarchy/${organisationId}`);
}

export type CreatePositionInput = {
  name: string;
  parentPositionId: number | null;
};

export function createPosition(
  organisationId: number,
  input: CreatePositionInput,
): Promise<{ message: string; position: Position }> {
  return apiRequest(`/api/hierarchy/${organisationId}/positions`, {
    method: "POST",
    body: input,
  });
}

export type UpdatePositionInput = {
  name?: string;
  parentPositionId?: number | null;
};

export function updatePosition(
  organisationId: number,
  positionId: number,
  input: UpdatePositionInput,
): Promise<{ message: string; position: Position }> {
  return apiRequest(`/api/hierarchy/${organisationId}/positions/${positionId}`, {
    method: "PATCH",
    body: input,
  });
}

export function deletePosition(
  organisationId: number,
  positionId: number,
): Promise<{ message: string; deletedCount: number }> {
  return apiRequest(`/api/hierarchy/${organisationId}/positions/${positionId}`, {
    method: "DELETE",
  });
}

/* ------------------------------------------------------------------------
   Departments
   --------------------------------------------------------------------- */

/** A department's roster row — mirrors node/src/organisation's Member shape. */
export type DepartmentMember = {
  id: number;
  profileId: number | null;
  fullName: string | null;
  username: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  title: string | null;
  designation: string;
  status: string;
};

export type CreateDepartmentInput = {
  name: string;
  parentPositionId: number | null;
  headPositionId: number | null;
};

export function createDepartment(
  organisationId: number,
  input: CreateDepartmentInput,
): Promise<{ message: string; department: Department }> {
  return apiRequest(`/api/hierarchy/${organisationId}/departments`, {
    method: "POST",
    body: input,
  });
}

export type UpdateDepartmentInput = {
  name?: string;
  parentPositionId?: number | null;
  headPositionId?: number | null;
};

export function updateDepartment(
  organisationId: number,
  departmentId: number,
  input: UpdateDepartmentInput,
): Promise<{ message: string; department: Department }> {
  return apiRequest(
    `/api/hierarchy/${organisationId}/departments/${departmentId}`,
    { method: "PATCH", body: input },
  );
}

export function deleteDepartment(
  organisationId: number,
  departmentId: number,
): Promise<{ message: string }> {
  return apiRequest(
    `/api/hierarchy/${organisationId}/departments/${departmentId}`,
    { method: "DELETE" },
  );
}

export function fetchDepartmentDetail(
  organisationId: number,
  departmentId: number,
): Promise<{ department: Department; members: DepartmentMember[] }> {
  return apiRequest(`/api/hierarchy/${organisationId}/departments/${departmentId}`);
}

export function addDepartmentMember(
  organisationId: number,
  departmentId: number,
  memberId: number,
): Promise<{ message: string }> {
  return apiRequest(
    `/api/hierarchy/${organisationId}/departments/${departmentId}/members`,
    { method: "POST", body: { memberId } },
  );
}

export function removeDepartmentMember(
  organisationId: number,
  departmentId: number,
  memberId: number,
): Promise<{ message: string }> {
  return apiRequest(
    `/api/hierarchy/${organisationId}/departments/${departmentId}/members/${memberId}`,
    { method: "DELETE" },
  );
}
