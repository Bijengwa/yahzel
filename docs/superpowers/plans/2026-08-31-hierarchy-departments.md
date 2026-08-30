# Departments-in-the-Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This particular plan was executed inline, in the same session that wrote it, by the engineer who already holds full context of the existing hierarchy feature (positions table, migration 009/010, admin-only access, cycle prevention). It is recorded here for the record and for anyone resuming the work, not handed to a fresh subagent — so tasks are described at file/behaviour granularity rather than full TDD micro-steps.

**Goal:** Make Departments real nodes in the organisation hierarchy tree — sitting under a Position, headed by a Position, summarised compactly (name + head + member count) — without ever rendering individual department members as tree nodes.

**Architecture:** Reuse the existing `positions` table and admin-gated hierarchy feature untouched for position-to-position structure. Add a `departments` table (schema already exists via migration 011, currently disconnected) with a new `parent_position_id` column so a department can attach under a position. A department's `head_position_id` is the *only* tree edge from a department down to a position; that position's own `parent_position_id` is forced to `null` and locked while it holds headship, so the existing position-only cycle-detection code stays correct unmodified and no dual-edge ambiguity exists. Department membership (department_members ↔ organisation_members) stays entirely outside the tree, visible only in a department detail panel.

**Tech Stack:** Express + Knex + Postgres (backend), Next.js + React + Tailwind (frontend), matching all existing hierarchy/organisation conventions.

## Global Constraints

- DO NOT COMMIT. DO NOT PUSH. Leave the working tree dirty for review.
- Admin-only gate (`requireAdminMembership`, unchanged) governs every hierarchy mutation and the department detail view, matching current position behaviour — no new permission system.
- No occupant/person field is ever added to `positions`. No "fake" department members are invented.
- The tree never renders individual department members — only the department node itself (name, head, count) and the head *position*.
- A department's parent is always a Position, never another department (V1 restriction).
- Horizontal-scroll-only tree at every breakpoint — remove the existing sub-40rem vertical-stack fallback in `globals.css`.
- Reuse `fetchOrganisationPeople` (existing endpoint) for the eligible-member picker; no new "list organisation members" endpoint.

---

## File Structure

**Backend (new):**
- `node/src/db/migrations/012_add_department_parent_position.ts` — adds `parent_position_id` to `departments`.
- `node/src/hierarchy/department.record.ts` — `DepartmentRecord`, `DepartmentMemberRecord`, table names.
- `node/src/hierarchy/department.repository.ts` — CRUD + membership queries + member-count aggregation.

**Backend (modified):**
- `node/src/hierarchy/hierarchy.service.ts` — export `requireAdminMembership` and the existing `isAncestor` helper for reuse; extend `getHierarchy` to also return departments; extend `updateHierarchyPosition` to reject re-parenting a department head; extend `deleteHierarchyPosition`'s message when the deleted position headed a department; add `createDepartment`, `updateDepartment`, `deleteDepartment`, `getDepartmentDetail`, `addDepartmentMember`, `removeDepartmentMember`.
- `node/src/hierarchy/hierarchy.validation.ts` — add `validateDepartmentName` (reuse the position-name validator shape).
- `node/src/hierarchy/hierarchy.controller.ts` — add department handlers.
- `node/src/hierarchy/hierarchy.routes.ts` — add department routes.
- `node/scripts/check-hierarchy-api.ts` — extend with department checks (tree placement, head locking, cycle rejection, member add/remove, org isolation).

**Frontend (modified):**
- `web/lib/hierarchy.ts` — `Department` type, unified `HierarchyNode` (position | department) tree builder, department CRUD client functions.
- `web/components/app/hierarchy/hierarchy-screen.tsx` — "Add department" action, department create/edit/delete modals, department detail modal (head + roster + add/remove member).
- `web/components/app/hierarchy/org-chart.tsx` — accept `HierarchyNode[]` instead of `PositionNode[]`.
- `web/components/app/hierarchy/org-chart-node.tsx` — branch rendering for department vs position nodes.
- `web/app/globals.css` — drop the `< 40rem` vertical-stack fallback; horizontal tree layout + scroll at all sizes.

---

## Task 1 — Migration: department parent position

**File:** `node/src/db/migrations/012_add_department_parent_position.ts`

Add nullable `parent_position_id` (unsigned int, FK → `positions.id`, `ON DELETE SET NULL`) with an index, mirroring `head_position_id`'s existing shape in migration 011. Document why `SET NULL` (a department must never disappear just because the position above it was deleted — it becomes a root department instead, re-parentable by an admin).

## Task 2 — Department record + repository

**File:** `node/src/hierarchy/department.record.ts`

```ts
export const DEPARTMENTS_TABLE = "departments";
export const DEPARTMENT_MEMBERS_TABLE = "department_members";

export type DepartmentRecord = {
  id: number;
  organisation_id: number;
  name: string;
  parent_position_id: number | null;
  head_position_id: number | null;
  created_at: string;
  updated_at: string;
};

export type DepartmentMemberRecord = {
  id: number;
  department_id: number;
  member_id: number;
  created_at: string;
};
```

**File:** `node/src/hierarchy/department.repository.ts`

- `listDepartments(organisationId)`
- `findDepartmentById(id)`
- `findDepartmentByHeadPositionId(headPositionId)` — for the one-head-per-department uniqueness check
- `createDepartment({ organisationId, name, parentPositionId, headPositionId })`
- `updateDepartment(id, patch)`
- `deleteDepartment(id)`
- `countMembersByDepartmentIds(departmentIds: number[]): Promise<Map<number, number>>` — one grouped query for the tree's compact "N members" summary
- `listDepartmentMembers(departmentId)` — joins `department_members` → `organisation_members` → `profiles`, same shape as `organisation.repository.ts`'s `listMembers`
- `addDepartmentMember(departmentId, memberId)`
- `removeDepartmentMember(departmentId, memberId)`
- `findDepartmentMember(departmentId, memberId)` — duplicate-add guard

## Task 3 — Service layer: shared helpers + department operations

**File:** `node/src/hierarchy/hierarchy.service.ts`

- Export `requireAdminMembership` (drop the `async function` → `export async function`).
- Export the existing `isAncestor` so department logic can reuse it directly — **no new merged-graph cycle system needed**: because a department head's `parent_position_id` is always locked to `null`, a cycle at the department level can only occur when the proposed `parentPositionId` is `headPositionId` itself or a descendant of it in the ordinary position tree. That is exactly `isAncestor(byId, headPositionId, parentPositionId)` using the plain existing position graph.
- `updateHierarchyPosition`: before accepting a non-null `parentPositionId` change, look up whether this position is currently `findDepartmentByHeadPositionId(positionId)`; if so, reject (422, field `parentPositionId`, "This position heads a department; its place in the tree comes from that department."). Renaming still works freely.
- `deleteHierarchyPosition`: after computing `descendantCount`, also check `findDepartmentByHeadPositionId(positionId)`; if found, append a clause to the message ("… <Department name> is now without a head.").

New exports, following the existing `HierarchyError` / `publicPosition` patterns:

```ts
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
```

- `getHierarchy(userId, organisationId)`: after loading positions, also `listDepartments`, `countMembersByDepartmentIds`, and build a `positionId -> name` map to fill `headPositionName`. Returns `{ positions, departments }`.

- `createDepartment(userId, organisationId, input)`:
  1. `requireAdminMembership`.
  2. Validate `name` (reuse position validator shape via a new `validateDepartmentName`).
  3. Validate optional `parentPositionId`/`headPositionId` as positive ids belonging to this organisation (mirrors the existing position parent check — 404-safe "not found" wording, never leaking cross-org existence).
  4. If `headPositionId` set: reject if `findDepartmentByHeadPositionId` already returns a *different* department (uniqueness).
  5. If both `parentPositionId` and `headPositionId` set: reject if equal, or if `isAncestor(byId, headPositionId, parentPositionId)` (parent would sit inside the new head's own subtree — the two-hop cycle described in Task 3's header note).
  6. Create the department.
  7. If `headPositionId` set and that position currently has a non-null `parent_position_id`, call `updatePosition(headPositionId, { parent_position_id: null })` in the same flow — documented as the deliberate normalisation that keeps the "department heads are always root in the position graph" invariant intact.
  8. Return `{ message, department: publicDepartment(...) }`.

- `updateDepartment(userId, organisationId, departmentId, input)`: same validation shape as create, applied against the existing row plus whichever fields changed; same head-uniqueness and cycle checks (using the *effective* headPositionId/parentPositionId — existing value when the field is omitted from the patch). Same auto-null-parent step when headPositionId changes to a new position.

- `deleteDepartment(userId, organisationId, departmentId)`: `requireAdminMembership`, ownership check, delete (cascades `department_members` via FK; head position is untouched — its `parent_position_id` stays `null`, so it simply becomes a root position, which is the correct, safe default).

- `getDepartmentDetail(userId, organisationId, departmentId)`: `requireAdminMembership`, ownership check, `listDepartmentMembers`, return `{ department: publicDepartment(...), members }`.

- `addDepartmentMemberToDepartment(userId, organisationId, departmentId, memberId)`: `requireAdminMembership`, ownership check for both department and the `organisation_members` row (must belong to this organisation and be `status === "active"`), duplicate check, insert.

- `removeDepartmentMemberFromDepartment(userId, organisationId, departmentId, memberId)`: `requireAdminMembership`, ownership check, delete.

## Task 4 — Validation, controller, routes

**File:** `node/src/hierarchy/hierarchy.validation.ts` — add:

```ts
export const DEPARTMENT_NAME_MIN_LENGTH = 2;
export const DEPARTMENT_NAME_MAX_LENGTH = 150;

export function validateDepartmentName(raw: unknown): Validated<string> {
  // same trim/collapse-whitespace/length-check shape as validatePositionName
}
```

**File:** `node/src/hierarchy/hierarchy.controller.ts` — add `createDepartmentHandler`, `updateDepartmentHandler`, `destroyDepartmentHandler`, `showDepartmentHandler`, `addDepartmentMemberHandler`, `removeDepartmentMemberHandler`, following the existing `handleFailure`/`readId` pattern exactly.

**File:** `node/src/hierarchy/hierarchy.routes.ts` — add:

```
POST   /:organisationId/departments
PATCH  /:organisationId/departments/:departmentId
DELETE /:organisationId/departments/:departmentId
GET    /:organisationId/departments/:departmentId
POST   /:organisationId/departments/:departmentId/members
DELETE /:organisationId/departments/:departmentId/members/:memberId
```

## Task 5 — Verification script

**File:** `node/scripts/check-hierarchy-api.ts` — extend the existing script (same throwaway-account, real-HTTP style) with:
- `GET /api/hierarchy/:id` now also returns `departments: []` initially.
- Create a department under Head; verify it appears with `memberCount: 0`, `headPositionId: null`.
- Assign an existing position (with a parent) as head; verify the department's `headPositionName` updates and that position's `parentPositionId` is now `null` in a follow-up `GET`.
- Attempt to `PATCH` that head position's `parentPositionId` directly → expect 422.
- Attempt to create a second department with the same head position → expect 422.
- Attempt a parent/head combination that would cycle (parentPositionId = a descendant of headPositionId) → expect 422.
- Add/remove a department member via the endpoints; verify `memberCount` changes; verify a non-admin is refused; verify a member from another organisation is refused.
- Delete the department; verify the (former) head position is now listed as a root position (`parentPositionId: null`) and untouched otherwise.
- Cross-organisation isolation checks mirroring the existing position ones (department from org B rejected as a parent/head source for org A, etc.).

Run with `npm run check:hierarchy` (backend dev server must be running).

## Task 6 — Frontend: types + API client

**File:** `web/lib/hierarchy.ts`

```ts
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

export type HierarchyNode =
  | (Position & { kind: "position"; children: HierarchyNode[] })
  | (Department & { kind: "department"; children: HierarchyNode[] });
```

Replace `buildPositionTree` with `buildHierarchyTree(positions: Position[], departments: Department[]): HierarchyNode[]`:
- Build `headPositionIds = new Set(departments.filter(d => d.headPositionId !== null).map(d => d.headPositionId!))`.
- Position children-by-parent map excludes anything in `headPositionIds` (it attaches under its department instead).
- Department children-by-parent map, keyed by `parentPositionId`.
- `buildPositionNode`: children = `[...departmentsUnderThisPosition.map(buildDepartmentNode), ...positionsUnderThisPosition.map(buildPositionNode)]`.
- `buildDepartmentNode`: children = the single head position's node if `headPositionId` resolves to a position in the list, else `[]`.
- Roots = root positions (`parentPositionId === null` and not a department head) + root departments (`parentPositionId === null`).

Keep `collectSubtreeIds` for the position-delete confirmation (unchanged — positions only).

`fetchHierarchy` return type becomes `{ positions: Position[]; departments: Department[] }`.

Add client functions mirroring the position ones exactly (`apiRequest`, same error shape):
`createDepartment`, `updateDepartment`, `deleteDepartment`, `fetchDepartmentDetail`, `addDepartmentMember`, `removeDepartmentMember`.

## Task 7 — Frontend: tree rendering

**File:** `web/components/app/hierarchy/org-chart.tsx` — accept `roots: HierarchyNode[]`; pass through unchanged otherwise.

**File:** `web/components/app/hierarchy/org-chart-node.tsx` — branch on `node.kind`:
- **Position node:** unchanged box, plus a small "Department head" eyebrow badge when this position id is in the head-positions set (computed once in the screen and passed down).
- **Department node:** visually distinct box (accent border/background, "DEPARTMENT" eyebrow label), showing name, `Head: {headPositionName ?? "No head assigned"}`, `{memberCount} member(s)`. Actions: **View** (opens detail modal), **Edit** (rename / change parent / change head), **Delete**. No "add child" action (a department's only tree child is its head, set via Edit).

## Task 8 — Frontend: screen wiring

**File:** `web/components/app/hierarchy/hierarchy-screen.tsx`

- Load `{ positions, departments }` together; compute `tree = buildHierarchyTree(positions, departments)`.
- "+ Add department" button next to "+ Add position" in the header actions.
- Add-department modal: name, "Reports to" (position select, same options as position's parent select), "Head position" (select from `positions`, with a hint that picking one already reporting elsewhere will move it here).
- Edit-department modal: same fields, pre-filled; on submit calls `updateDepartment`.
- Delete-department confirm modal: shows head name + member count, same danger-button pattern as position delete.
- Department detail modal (opened by "View"): head, member roster (`fetchDepartmentDetail`), "+ Add member" control listing eligible active members from `fetchOrganisationPeople` not already on the roster, remove-member action per row.
- Edit-position modal: when the position being edited is a department head (cross-reference `departments`), disable the "Reports to" field with helper text explaining why (matches the backend's rejection so the UI never offers a doomed action).

## Task 9 — Mobile / horizontal scroll behaviour

**File:** `web/app/globals.css` — remove the `@media (min-width: 40rem)` gate that currently turns the horizontal-tree rules on only above that width; make the row-layout + connector rules unconditional so the tree stays a real horizontal tree at every viewport, relying purely on `org-chart.tsx`'s existing `overflow-x-auto` wrapper to contain the scroll. Keep the reduced-motion block as-is.

## Task 10 — Verification pass

- [ ] `cd node && npm run typecheck`
- [ ] `cd node && npm run dev` (leave running), then `npm run check:hierarchy`
- [ ] `cd web && npm run lint`
- [ ] `cd web && npx tsc --noEmit` (or `npm run build` if time allows)
- [ ] Manual desktop browser pass: create the Microsoft-style and Ministry-style structures from the spec; confirm departments render as tree nodes, heads render as their children, members never appear in the tree, department detail shows the roster, long names wrap/clip sanely, dark mode looks correct.
- [ ] Manual mobile-width pass (browser resize to ~375px): confirm the tree stays a real tree and scrolls horizontally inside its own box, with no page-wide horizontal overflow.

---

## Self-Review Notes

- **Spec coverage:** §1 (departments as tree nodes) → Tasks 6–7. §2 (no member dump) → Task 6/8 (detail modal only). §3 (head identification) → `headPositionId`/`headPositionName` throughout. §4 (position/department/person separation) → unchanged position model + new department model, no occupant field added. §5 (tree answers structure only) → same. §6 (real tree) → Task 7/9. §7 (horizontal scroll, mobile included) → Task 9. §8 (Head requirement) → already satisfied by existing migration 010/`createOrganisationWithAdmin`, untouched. §9 (admin/HR) → deliberately kept to the existing admin-only gate; no new role system (see Global Constraints). §10 (department detail) → Task 8. §11 (linked work) → not implemented, correctly out of scope. §12 (don't overbuild) → no matrix/dotted reporting, no job families, single admin gate. §13 (verify first) → this plan's investigation phase. §14 (test structures) → Task 10 manual pass. §15 (final verification) → Task 10.
