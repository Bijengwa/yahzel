# Position Occupancy & Department Membership — Phase 1 Analysis Plan

> **Status:** Analysis only. No code, no migrations, no UI, no commits. This
> document exists for review before any Phase 2 execution plan is written.

**Goal:** Identify the exact gaps between the existing organisation/hierarchy
model and the six areas the user asked about (occupancy, department
membership, designation, authorization, Head, Work), and propose a Phase 2
direction for each — without touching code.

## Important preliminary finding

The local `main` checkout is **17 commits behind `origin/main`**. All of the
hierarchy code this plan discusses (`positions`, `departments`,
`node/src/hierarchy/*`, the org-chart UI) exists only on `origin/main` (merged
via PRs `#2` and `#3` from `feat/work-w0-frontend`), not in the current
working tree. This entire analysis was produced by reading files at
`origin/main` with `git show` — the working tree itself was never modified.
**Before any Phase 2 execution, `main` needs `git pull` first**, or Phase 2
will appear to be starting from scratch when the target files don't exist
locally yet.

---

## 1. What already exists

### `organisation_members` (migrations 004, 005, 006, 008)
Columns: `id`, `organisation_id`, `profile_id` (nullable — null while an
invitation is unclaimed), `email`, `system_role` (`admin`|`member` — pure
Yahzel access, never a job), `participation_type` (`employee`|`intern`|
`volunteer`|`contractor`|`consultant`|`member`|`other`), `organisation_class`
(`administration`|`member`), `designation` (`head`|`director`|`manager`|
`member`), `title` (free text), `status` (`active`|`inactive`|`concluded`,
never deleted), `invited_by`, `joined_at`, `left_at`, `expected_end_at`,
timestamps.

`organisation.validation.ts`'s `checkClassAndDesignation` enforces one rule:
`head`/`director`/`manager` designations may only pair with
`organisation_class = "administration"`. Nothing else constrains
`designation` today — it is a free-standing, manually-set field.

### `system_role`
Two values only: `admin`, `member`. This is the **only** access-control
signal that exists anywhere in the codebase today. Every authorization check
in `organisation.service.ts`, and the hierarchy code below, ultimately reduces
to reading `system_role` (and `status === "active"`) off a single
`organisation_members` row.

### `organisation_class`
Two values: `administration` | `member`. A coarse leadership-vs-everyone-else
split, unrelated to `system_role`. Purely descriptive today — nothing reads it
for authorization.

### `positions` + `parent_position_id` (migration 009)
```
positions: id, organisation_id, name, parent_position_id (self-FK, nullable,
  ON DELETE CASCADE), created_at, updated_at
```
Deliberately occupant-less by design — the migration's own comment states
"no occupant, no person_id... Connecting people to positions is a separate
future feature." Multiple roots are allowed (no single-root assumption).
Deleting a position cascades to its whole subtree.

Backend: `node/src/hierarchy/{hierarchy.record,repository,service,
controller,routes}.ts`. Full admin-gated CRUD: create, rename/move (with
cycle prevention via `isAncestor`), delete (with subtree-size reporting).
Access is gated by a **hierarchy-local** `requireAdminMembership(userId,
organisationId)` that re-fetches the organisation and membership and checks
`status === "active" && system_role === "admin"` — this duplicates, rather
than reuses, the equivalent (module-private) `requireAdmin(membership)` in
`organisation.service.ts`.

Migration 010 backfills a root `"Head"` position for any organisation with
zero root positions (idempotent, structural check — not name-based).
`organisation.repository.ts`'s `createOrganisationWithAdmin` now also inserts
a `"Head"` root position at registration time, in the same transaction as the
first (admin) membership. **No one is placed in that position** — it is an
empty tree node from creation.

Frontend: `web/lib/hierarchy.ts` (typed client + `buildPositionTree` /
`collectSubtreeIds` helpers), `web/components/app/hierarchy/{hierarchy-screen,
org-chart,org-chart-node}.tsx`. Renders/administers the tree only. The
screen's own comment: *"There are no people here."*

### `departments` + `head_position_id` + `department_members` (migration 011)
```
departments: id, organisation_id, name,
  head_position_id (FK positions, nullable, ON DELETE SET NULL), timestamps
department_members: id, department_id (FK departments, CASCADE),
  member_id (FK organisation_members.id, CASCADE), created_at
  UNIQUE(department_id, member_id)
```
**This is schema only.** There is no `node/src/department/*` of any kind —
no record, repository, service, controller, or routes file — and no
frontend. `git ls-tree` on `origin/main` confirms the migration file is the
only department-related file in the entire repository. Nothing reads or
writes these two tables anywhere in application code today.

### Current hierarchy authorization
Exactly one signal exists, checked in two independent places:
1. `organisation.service.ts` → `requireAdmin(membership: OrganisationMemberRecord)`: `status === "active" && system_role === "admin"`. Used by `updateStanding`, `concludeMembership`, `inviteToOrganisation`, `getOrganisationInvitations`, `cancelInvitation`.
2. `hierarchy.service.ts` → `requireAdminMembership(userId, organisationId)`: performs its own `findOrganisationById` + `findMembership` lookup, then applies the identical `status === "active" && system_role === "admin"` check.

Both are module-private (not exported), so nothing currently shares this
logic. There is no `manage_structure`/`manage_occupancy` column, and no
parallel Admin/HR permission system — the only two possible authorization
values in the whole app are "admin" and "not admin."

### Work (migration 008) — for context only, not touched in this plan
`work_items` + `work_assignments` (assignment history kept as new rows,
never overwritten). Assignment/visibility checks in `work.service.ts` key
**only** on `findMembership(...).status === "active"` — any active member,
regardless of `designation`, `organisation_class`, or (nonexistent) position,
can currently be assigned work or assign it to others. Nothing in Work
references `positions`, `departments`, or any hierarchy concept.

---

## 2. What is missing

1. **Position occupancy** — does not exist at all. No table, no join, no
   history. Nothing answers "who occupies position X," "since when," or "who
   occupied it before."
2. **Department membership backend** — `department_members` exists in the
   database only; there is no service layer, so it cannot conflict with
   anything yet, but a Phase 2 design must prevent it from becoming a second,
   disagreeing source of truth once occupancy exists (see §4).
3. **Designation ↔ occupancy link** — `designation` is 100% manual today.
   There is no mechanism, and none is implied by any existing code, connecting
   it to a position or an occupant.
4. **Department/occupancy authorization** — nothing to gate yet, since
   neither feature has a service layer. The existing precedent (hierarchy
   positions) is admin-only, gated by a **duplicated** check.
5. **Head/position/occupancy coherence** — three "Head" ideas exist
   independently and are not reconciled: (a) `designation = "head"` on a
   membership, (b) the auto-created root `"Head"` position node, (c) the
   not-yet-existing occupant of that node. Nothing prevents two members
   having `designation = "head"` simultaneously, nor prevents the Head
   position from sitting empty while someone holds the `head` designation, or
   vice versa.
6. **Work's future consumption** — Work currently has no hook point for
   position/department data; adding one is out of scope here, so this is
   listed as a forward-looking requirement, not a gap to close now.

---

## 3. Position occupancy — proposed schema (Phase 2, not created now)

```
position_occupancies
  id                    serial primary key
  position_id           integer NOT NULL REFERENCES positions(id) ON DELETE CASCADE
  organisation_member_id integer NOT NULL REFERENCES organisation_members(id) ON DELETE CASCADE
  started_at            timestamptz NOT NULL DEFAULT now()
  ended_at              timestamptz NULL          -- null = current occupant
  created_at / updated_at timestamptz NOT NULL DEFAULT now()

  -- one active occupant per position at a time (mirrors the partial-unique
  -- idiom migration 005 already uses for open invitations):
  UNIQUE (position_id) WHERE ended_at IS NULL
```

Design notes:
- FK targets `organisation_members.id`, **not** `profiles.id` — matching
  `department_members.member_id`'s existing choice, because occupancy is a
  fact about a *membership* (it must end when the membership ends), not a
  raw person.
- `ON DELETE CASCADE` on both FKs matches `positions`' own cascade idiom
  (deleting a position or a membership removes the occupancy history with
  it, no orphaned rows) and `department_members`' choice for `member_id`.
- Ending an occupancy is a new row with `ended_at` set, or the existing open
  row gets `ended_at` filled — history is never overwritten, consistent with
  `work_assignments` and `organisation_members.left_at`.
- **Open question, not resolved here:** should a member hold more than one
  position simultaneously? A second partial unique index —
  `UNIQUE (organisation_member_id) WHERE ended_at IS NULL` — would forbid
  it. This is a product decision, not a technical one; Phase 2 should ask
  before assuming either way.

---

## 4. Department membership vs. occupancy — avoiding two sources of truth

`department_members` (who is in department X) and the proposed
`position_occupancies` (who occupies position Y) answer **different**
questions and should stay separate rows, the same way `positions` and
`departments` already stay separate tables (migration 011's own comment: "a
position never lists members, and a department is never a node the
reporting tree renders"). The risk is not the schema — it's letting
application logic silently assume department membership *implies* occupying
that department's `head_position_id`, or vice versa. Phase 2 should treat
`departments.head_position_id` purely as "which position, if occupied, heads
this department" — a lookup through `position_occupancies`, never a
duplicated occupant field on `departments` itself. Concretely:
- Department roster = `department_members` rows. Independent of any position.
- Department head = `departments.head_position_id` → look up the position's
  current row in `position_occupancies` (if any) → that member. Computed at
  read time, never stored redundantly on `departments`.
- Nothing requires a department's head to also be a `department_members` row
  of that same department (an organisation might want its Head to head a
  department without being "in" it) — this should be an explicit, documented
  choice in Phase 2, not an accidental gap.

---

## 5. Designation — analysis only, not changed

Two directions exist for Phase 2; this plan does not choose between them:

**(a) Keep `designation` manual/independent (recommended starting point).**
Occupancy becomes a purely structural fact (who sits where in the reporting
tree); `designation` stays the organisation's own coarse rank, exactly as
`checkClassAndDesignation` already treats it. Simplest, zero schema churn,
and matches how `title` already coexists as a second independent
descriptive field.

**(b) Derive `designation` from active occupancy.** Would require positions
to carry a "kind"/"level" attribute they don't have today (a `positions.kind`
column mapping to `head`/`director`/`manager`/`member`), since a bare
position `name` (free text, e.g. "Chief Executive Officer") cannot be
reliably mapped to the four fixed `designation` values. This is a
non-trivial schema addition and a behavior change (designation would stop
being directly editable), so it should be a deliberate future decision, not
a Phase 1 or early-Phase-2 default.

**Recommendation:** Ship occupancy under (a) first. Revisit (b) only if the
organisation's need for `designation` to reflect real occupancy becomes
concrete — it is speculative today.

---

## 6. Authorization — proposed rules, derived from the existing model only

No new columns, no new roles, no parallel permission system. Every
capability below reduces to the same `(system_role, status)` pair already on
`organisation_members`, exactly as `requireAdmin`/`requireAdminMembership`
do today.

| Capability | Proposed rule | Precedent |
|---|---|---|
| Manage structure (create/rename/move/delete positions; create/rename departments) | `status === "active" && system_role === "admin"` | Already implemented, identical rule, in `hierarchy.service.ts` |
| Manage occupancy (assign/end an occupant) | Same admin rule, to start | No existing precedent to diverge from; flagged as an open decision below |
| Manage department membership (add/remove `department_members` rows) | Same admin rule | Consistent with structure management |

**Consolidation recommendation:** the duplicated admin check
(`organisation.service.ts`'s private `requireAdmin` vs.
`hierarchy.service.ts`'s private `requireAdminMembership`) should become one
shared, exported helper (e.g. `requireAdminMembership` moved to a shared
module) that both `hierarchy.service.ts` and the new `department`/
`occupancy` services call, rather than adding a third copy. This is a
refactor to flag for Phase 2, not something to do now.

**Open decision, not resolved here:** should assigning/removing the *Head*
occupant specifically require something stricter than plain admin (e.g. only
the current Head, or a majority of Administration)? Nothing in the existing
model supports a stricter rule without inventing new state, so the default
recommendation is: same admin gate as everything else, until the user
decides otherwise.

---

## 7. Head — interaction with `organisation_class`/`designation`/hierarchy

Today, "Head" is three unconnected things:
1. `organisation_members.designation === "head"` (a manual, unenforced-unique
   attribute, constrained only to pair with `organisation_class ===
   "administration"`).
2. The auto-created root `positions` row named `"Head"` (a tree node with no
   occupant, present from organisation creation via migration 010's backfill
   and `createOrganisationWithAdmin`'s insert).
3. The (not yet existing) occupant of that position.

Phase 2 needs to decide, explicitly, whether these should be reconciled —
e.g., does assigning someone to the Head *position* automatically set their
`designation` to `head`? Does it matter if the position has been renamed
away from literally "Head" (which the codebase already explicitly allows —
migration 010's comment notes an org can rename the root to "Chief Executive
Officer" and it's still functionally the head)? This plan does not answer
that; it only surfaces that the three concepts currently have zero code
connecting them, so any Phase 2 occupancy work will immediately raise the
question.

---

## 8. Work — what it will eventually consume (not implemented here)

Work's assignment/visibility logic currently only checks active membership
status. Once occupancy exists, Work could eventually consume (in some future
phase, not this one):
- Whether an assignee's position has a parent (for "escalate to my manager"
  style flows) — via `position_occupancies` joined through
  `positions.parent_position_id`.
- Whether an assignee is the occupant of a `departments.head_position_id`
  (for department-scoped approval flows).

No Work file should change as part of Phase 1 or the eventual occupancy
migration itself — this section exists only to record the dependency
direction (Work → occupancy, never the reverse) for whoever writes that
future plan.

---

## 9. Migration(s) that would eventually be required (Phase 2 — not created now)

- `012_create_position_occupancies.ts` — the table in §3.
- Department backend work needs **no new migration** — `departments`/
  `department_members` already exist from migration 011; only application
  code (`node/src/department/*`) is missing.
- A possible future migration adding `positions.kind` (or similar), **only**
  if designation-derivation (§5 option b) is later chosen. Not planned now.

---

## 10. Affected backend/frontend files (Phase 2 preview — not touched now)

**Backend, new:**
- `node/src/hierarchy/occupancy.record.ts`, `occupancy.repository.ts`,
  `occupancy.service.ts`, `occupancy.controller.ts` — kept as *separate*
  files from `hierarchy.service.ts` (already 345 lines) rather than grown
  into it, per this codebase's one-responsibility-per-file convention. Routes
  can extend `hierarchy.routes.ts` (e.g. `POST
  /:organisationId/positions/:positionId/occupant`) since they share the
  `/api/hierarchy` mount.
- `node/src/department/department.record.ts`, `department.repository.ts`,
  `department.service.ts`, `department.controller.ts`,
  `department.routes.ts` — currently fully absent; would mount at a new
  `/api/departments` prefix in `node/src/app.ts`, mirroring how `hierarchy`
  and `work` are each mounted separately today.
- A shared authorization helper (new `node/src/shared/authorization.ts`, or
  exporting `organisation.service.ts`'s existing `requireAdmin`) — consumed
  by `organisation.service.ts`, `hierarchy.service.ts`, and the two new
  service files above, replacing the current duplication.

**Backend, modified:**
- `node/src/organisation/organisation.service.ts` — `concludeMembership`
  would need to also close any open `position_occupancies` row and remove
  `department_members` rows for that member (see §11).

**Frontend, new (not built now):**
- `web/lib/occupancy.ts`, `web/lib/department.ts` — typed clients mirroring
  `web/lib/hierarchy.ts`'s existing pattern.
- UI to show/assign an occupant on `web/components/app/hierarchy/
  org-chart-node.tsx` and a new departments screen — explicitly out of scope
  for this plan.

---

## 11. Data integrity rules (for Phase 2 design, recorded now)

- An occupancy row's `organisation_member_id` must belong to the same
  `organisation_id` as its `position_id` — cross-organisation occupancy is
  invalid. Postgres can't express this as a simple FK constraint across two
  tables; it must be an application-level check, the same way
  `hierarchy.service.ts`'s `createHierarchyPosition` already validates that
  a `parentPositionId` belongs to the same organisation before accepting it.
- Concluding a membership (`organisation_members.status` → `inactive` /
  `concluded`) must close any open `position_occupancies` row for that
  member (`ended_at` set) — otherwise a departed member stays listed as
  occupying a position indefinitely. This belongs in
  `organisation.service.ts`'s existing `concludeMembership`, not duplicated
  elsewhere.
- The same applies to `department_members` — a concluded membership should
  be removed from (or otherwise excluded from) department rosters.
- `departments.head_position_id` already handles position deletion safely
  (`ON DELETE SET NULL`, migration 011). Occupancy design should follow the
  same "never silently orphan" idiom already used by
  `hierarchy.service.ts`'s `deleteHierarchyPosition` (which reports subtree
  size rather than deleting quietly).

---

## 12. What will NOT change (Phase 1)

- `organisation_members.designation` — untouched; stays a manual field.
- No `manage_structure` / `manage_occupancy` (or any other) boolean columns
  added to any table.
- No parallel Admin/HR permission system introduced.
- `positions`, `departments`, `department_members` schemas — untouched.
- Work (`work_items`, `work_assignments`, and all `node/src/work/*` /
  `web/lib/work.ts` / `web/components/app/work/*` files) — untouched.
- No migration files created or run.
- No UI changes.
- No commits, no pushes.

## 13. Explicitly out of scope (Phase 1)

- Writing the `012_create_position_occupancies.ts` migration.
- Writing any `node/src/department/*` or occupancy repository/service/
  controller code.
- Any UI for departments or occupancy.
- Resolving the designation-derivation question (§5) — two options are
  recorded, neither is chosen.
- Resolving whether Head-occupancy assignment needs a stricter gate than
  plain admin (§6) — recorded as an open decision.
- Deciding single- vs. multi-position occupancy per member (§3) — recorded
  as an open decision.
- Pulling `origin/main` into the local branch (recommended before Phase 2,
  but not performed as part of this analysis).
