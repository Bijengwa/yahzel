# Work UI Refinement (Table-First List, Self-Assignment) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note:** this plan is executed inline, in the same session that
> wrote it (the author already holds full codebase context from building the
> original Work frontend). Per writing-plans' "Inline Execution" handoff
> option, tasks below are still ordered and independently verifiable, but
> steps are written at the density a single continuous session needs rather
> than the density a cold subagent would need.

**Goal:** Refine the existing Work frontend (built on the merged W0 backend)
so the list reads as a dense professional table (per the supplied
task-management UI reference), and so self-assignment (Person → Self) is a
first-class, clearly supported path alongside Person → Person delegation.

**Architecture:** No backend changes. No new dependencies. Existing
components (`Panel`, `PanelGroup`, `Button`, field primitives, `StatusPill`)
are reused; only their arrangement and the copy around them changes.

**Tech Stack:** Next.js App Router, React 19, Tailwind v4 `yz-*` tokens —
unchanged from the rest of the codebase.

## Global Constraints

- Do NOT modify anything under `node/` — the W0 backend is frozen for this task.
- Do NOT add new npm dependencies (no table library, no popover/dropdown library).
- Do NOT implement hierarchy, departments, teams, child Work, reports, or ratings.
- Do NOT enforce `creator != assignee` anywhere — self-assignment (Person → Self) must work exactly like Person → Person.
- Do NOT invent columns/fields the W0 API does not return. Available per Work Item: `title`, `status`, `progress`, `dueAt`, `updatedAt`, `createdBy`, and the active assignment's `assigneeProfileId`/`assignedBy`/`instructions`.
- Do NOT touch `nav.tsx`, `sidebar.tsx`, `app-shell.tsx`, or any page outside `/work` and (if actually broken) `/notifications`.
- Desktop: table/list is the primary visual object, with compact filter/sort/view controls in a single row above it — not three stacked full-width labeled form fields.
- Mobile: never force the desktop table into horizontal scroll; rows become compact stacked summaries (already the case in `WorkRow` — preserve this).
- Tab semantics (redefined by this plan): **My Work** = Work Items whose *current* active assignee is me (includes self-assigned). **Assigned by Me** = Work Items I created whose current active assignee is *someone else*. These are mutually exclusive under W0 (every created Work Item always has exactly one active assignment), so nothing is hidden by this split.

---

### Task 0: Confirm `/notifications` already satisfies "workspace page, not modal"

**Files:** none expected to change — `web/app/(app)/notifications/page.tsx`, `web/components/app/notifications/notifications-screen.tsx`, `web/components/app/notifications/notification-bell.tsx`.

Prior commit `d004345` ("restore notifications page - dedicated /notifications route, convert bell to navigation, dense invitation rows") already made `/notifications` a dedicated routed page and the bell a plain `<Link>` (no dropdown/modal). Manual browser check during Task 4's verification pass confirms this is still true; if it regressed, fix it then. No code changes are planned here — this task is a verification checkpoint, not a build step.

---

### Task 1: Self-assignment made explicit in the assignee picker

**Files:**
- Modify: `web/components/app/work/assignee-select.tsx`
- Modify: `web/components/app/work/work-create-screen.tsx`
- Modify: `web/components/app/work/work-detail-screen.tsx`

**Interfaces:**
- `AssigneeSelect` gains an optional `currentProfileId?: number | null` prop. When an eligible member's `profileId === currentProfileId`, its option label becomes `"<name> (You)"` instead of just `"<name>"`. This makes self-assignment discoverable without adding a second control or new dependency.
- `WorkCreateScreen` and the reassignment form inside `WorkDetailScreen` both pass `profile?.id` (from `useProfile()`) as `currentProfileId`.

- [ ] In `assignee-select.tsx`, add the prop and branch the label:
  ```tsx
  export function AssigneeSelect({
    id,
    label,
    members,
    value,
    error,
    hint,
    currentProfileId,
    onChange,
  }: {
    id: string;
    label: string;
    members: Member[];
    value: string;
    error?: string;
    hint?: string;
    currentProfileId?: number | null;
    onChange: (value: string) => void;
  }) {
    const eligible = members.filter(
      (member) => member.status === "active" && member.profileId !== null,
    );

    return (
      <SelectField
        id={id}
        label={label}
        hint={hint}
        error={error}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose a person</option>

        {eligible.map((member) => {
          const name =
            member.fullName ?? member.email ?? `Member #${member.profileId}`;
          const isSelf = member.profileId === currentProfileId;

          return (
            <option key={member.profileId} value={member.profileId ?? ""}>
              {isSelf ? `${name} (You)` : name}
            </option>
          );
        })}
      </SelectField>
    );
  }
  ```
- [ ] `work-create-screen.tsx`: import `useProfile` from `../profile/profile-provider`, call it in `WorkCreateScreen`, and pass `currentProfileId={profile?.id ?? null}` to the existing `<AssigneeSelect>` call.
- [ ] `work-create-screen.tsx`: update the page description to stop implying delegation-only, e.g. change
  `"A standalone Work Item, assigned directly to someone in your organisation."`
  to
  `"Assign this to yourself or to someone in your organisation."`
- [ ] `work-detail-screen.tsx`: pass `currentProfileId={profile?.id ?? null}` to the reassignment form's `<AssigneeSelect>` call (the component already calls `useProfile()`).
- [ ] Verify: `cd web && npx tsc --noEmit` clean.
- [ ] Commit is deferred to the end of the whole plan (one focused commit per Task 4, not one per task here — this is a small refinement, not a multi-day build). No `git commit` yet.

---

### Task 2: Dense table row — assignee terminology, column order

**Files:**
- Modify: `web/components/app/work/work-row.tsx`

**Interfaces:** unchanged — still `WorkRowHeader()` and `WorkRow({ item, ownerName })`. Only internal column order/labels change; `work-list-screen.tsx` (Task 3) keeps calling it the same way.

Current desktop column order is `Work, Owner, Status, Progress, Due, Updated`. The reference table and this plan's own conceptual sketch both order columns `WORK, STATUS, ASSIGNEE, DUE, PROGRESS`. Reorder to that, keep `Updated` last (it is backend-supported via `updatedAt` and used by the existing "Recently updated" sort — dropping it would remove information the sort control implies exists), and rename the "Owner" header/labels to "Assignee" throughout (matches the plan's naming and the product's own `assignee`/`assignment` vocabulary).

- [ ] Update the `GRID` template to 6 columns in the new order (title gets more room, assignee/status/due/progress/updated share the rest):
  ```tsx
  const GRID =
    "grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]";
  ```
- [ ] `WorkRowHeader`: reorder spans to `Work, Status, Assignee, Due, Progress, Updated`.
- [ ] `WorkRow`: reorder the desktop `<span>` blocks so Status renders before Assignee, matching the new header order (the mobile stacked summary already shows status first and owner text second, so it already matches — no change needed there beyond the reorder). Tighten row vertical padding slightly (`py-2.5` → `py-2`) to read denser, matching the reference's compact row height.
- [ ] Verify visually via the manual browser pass in Task 4 (no isolated test harness exists for this component — the codebase has no component-test setup, matching the established convention of manual verification for presentational components).

---

### Task 3: Compact toolbar + corrected tab scoping + copy on the list screen

**Files:**
- Modify: `web/components/app/work/work-list-screen.tsx`

**Interfaces:** unchanged public surface (`WorkListScreen()` takes no props, same as today).

- [ ] Replace the page description to stop implying delegation-only creation:
  `"Standalone Work Items you create and assign directly to someone."`
  →
  `"Work you're handling yourself, and Work you've assigned to others."`
- [ ] Fix the view scoping so the two tabs are mutually exclusive under the redefined semantics (Global Constraints above):
  ```tsx
  const byView =
    view === "mine"
      ? items.filter(
          (item) => item.activeAssignment?.assigneeProfileId === profile.id,
        )
      : items.filter(
          (item) =>
            item.createdBy === profile.id &&
            item.activeAssignment?.assigneeProfileId !== profile.id,
        );
  ```
- [ ] Replace the toolbar's `grid gap-3 sm:grid-cols-[...]` of three full-width `TextField`/`SelectField` (each with its own visible label) with a single flex row of compact, unlabeled (aria-labeled) controls, plus move the view tabs into that same row instead of the `PanelGroup`'s `trailing` slot — so on desktop the whole row reads `[My Work] [Assigned by Me]  ⋯  [search] [status] [sort]` on one line, and wraps naturally at narrower widths before the `sm:hidden`/stacked-row breakpoint in `WorkRow` takes over. Concretely:
  ```tsx
  const COMPACT_CONTROL =
    "h-8 rounded-sm border border-yz-neutral-300 bg-yz-panel px-2.5 text-[12.5px] text-yz-ink outline-none transition-colors duration-150 focus:border-yz-ink";
  ```
  and restructure the `PanelGroup` body:
  ```tsx
  <PanelGroup
    title="Work"
    trailing={
      <div role="tablist" aria-label="Work view" className="flex gap-1">
        <Button
          role="tab"
          aria-selected={view === "mine"}
          variant={view === "mine" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setView("mine")}
        >
          My Work
        </Button>

        <Button
          role="tab"
          aria-selected={view === "assigned"}
          variant={view === "assigned" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setView("assigned")}
        >
          Assigned by Me
        </Button>
      </div>
    }
  >
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <label htmlFor="workSearch" className="sr-only">
        Search by title
      </label>
      <input
        id="workSearch"
        type="text"
        placeholder="Search by title…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className={`${COMPACT_CONTROL} w-full sm:w-56`}
      />

      <label htmlFor="workStatusFilter" className="sr-only">
        Status
      </label>
      <select
        id="workStatusFilter"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
        className={`${COMPACT_CONTROL} w-full sm:w-auto`}
      >
        <option value="">All statuses</option>
        {WORK_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="workSort" className="sr-only">
        Sort
      </label>
      <select
        id="workSort"
        value={sort}
        onChange={(event) => setSort(event.target.value as SortKey)}
        className={`${COMPACT_CONTROL} w-full sm:w-auto`}
      >
        <option value="updated">Recently updated</option>
        <option value="due">Due soonest</option>
        <option value="progress">Progress</option>
        <option value="title">Title (A–Z)</option>
      </select>
    </div>

    {/* existing loading / empty / table branches, see next step */}
  </PanelGroup>
  ```
  `TextField`/`SelectField` imports become unused in this file and must be removed; `Button` stays (used by the tabs and the retry link).
- [ ] Distinguish the two reasons a list can be empty — no items at all vs. filters/search matching nothing — since both currently render identical copy (a deferred Minor finding from the prior phase's ledger):
  ```tsx
  {items === null && !error ? (
    <p className="text-[13px] text-yz-neutral-600">Loading…</p>
  ) : scoped.length === 0 ? (
    <p className="text-[13px] leading-6 text-yz-neutral-600">
      {items.length === 0
        ? view === "mine"
          ? "There is currently no Work assigned to you."
          : "You have not assigned any Work to anyone yet."
        : "No Work matches your search or filters."}
    </p>
  ) : (
    /* unchanged table rendering */
  )}
  ```
  `items.length` here refers to the full pre-view-scoping `items` array — it distinguishes "nothing in the account at all" from "this view/filter combination matched nothing." This branch is only reached once `items !== null` (guarded by the preceding condition), so `items.length` is safe as written.
- [ ] Verify: `cd web && npx tsc --noEmit && npm run lint` clean.

---

### Task 4: Full verification pass

- [ ] `cd web && npx tsc --noEmit`
- [ ] `cd web && npm run lint`
- [ ] `cd web && npm run build` — confirm `/work`, `/work/new`, `/work/[id]` still present in the route summary.
- [ ] Manual browser verification (dev servers already running on :3000/:5000 from the prior phase):
  - `/work` toolbar is a single compact row on desktop (view tabs, search, status, sort), not three stacked labeled fields.
  - Create a Work Item assigned to **self** — appears under **My Work**, the assignee option reads "`<name> (You)`" in the picker.
  - Create a Work Item assigned to **another** active member (if the test org has one) — appears under **Assigned by Me**, disappears from **My Work**.
  - Reassign a self-assigned item to someone else — moves from My Work to Assigned by Me; reassign back to self — moves back.
  - Search, status filter, sort all still work against the new compact controls.
  - Empty-state copy differs between "no items at all" and "filtered to zero."
  - `/work/[id]` still renders Overview/People/Assignment history correctly; reassignment picker shows "(You)" for self.
  - 404/not-found behaviour for a nonexistent/inaccessible id still shows the generic message.
  - `/notifications` is still a dedicated page (not a modal); mark-as-read and mark-all-read still work; invitation accept/decline still works.
  - Mobile viewport (375×812): `/work` list is the stacked-row format, no horizontal scroll; toolbar controls stack sanely.
  - Dark mode: `/work`, `/work/new`, `/work/[id]`, `/notifications` all readable with correct contrast.
- [ ] Fix anything broken by this refinement (do not fix unrelated pre-existing issues).
- [ ] Re-run typecheck/lint/build after fixes.
- [ ] `git diff main --stat -- web node` — confirm changes stay inside `web/components/app/work/*` (plus nothing under `node/`).
- [ ] One focused commit: `git add` the changed Work files, commit message summarizing the table-first redesign and self-assignment support.
- [ ] Report results and STOP — do not start hierarchy work.
