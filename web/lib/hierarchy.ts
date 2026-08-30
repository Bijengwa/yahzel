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

export type PositionNode = Position & { children: PositionNode[] };

/**
 * The flat list the API returns, arranged into the tree the workspace
 * renders. A position whose declared parent is missing from the list (which
 * the backend's own invariants should never produce) surfaces as its own
 * root rather than disappearing, so a data inconsistency stays visible.
 */
export function buildPositionTree(positions: Position[]): PositionNode[] {
  const byId = new Map<number, PositionNode>(
    positions.map((position) => [position.id, { ...position, children: [] }]),
  );

  const roots: PositionNode[] = [];

  for (const position of positions) {
    const node = byId.get(position.id);

    if (!node) {
      continue;
    }

    const parent =
      position.parentPositionId !== null
        ? byId.get(position.parentPositionId)
        : undefined;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
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
): Promise<{ positions: Position[] }> {
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
