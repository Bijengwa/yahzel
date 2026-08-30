# Work Engine W0 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real Work experience in the existing Next.js `web/` app on top of the already-merged W0 backend (`/api/work`): a list page with "My Work"/"Assigned by Me" views, a create form, and a detail page supporting edit and reassignment — all built from the existing UI primitives and API conventions, with zero new dependencies and zero backend changes.

**Architecture:** Three routes under the existing `app/(app)/` authenticated route group (`/work`, `/work/new`, `/work/[id]`), each a thin server-component `page.tsx` handing off to a `"use client"` screen component in `components/app/work/`, exactly mirroring how `organisation/` is built. A new `lib/work.ts` provides typed `apiRequest` wrappers mirroring `lib/organisation.ts`. Every visual element reuses existing primitives (`Panel`/`PanelGroup`/`PanelRow`/`ReadRow`/`StatusMessage`, `Button`, `TextField`/`TextAreaField`/`SelectField`, `StatusPill`, `Avatar`) — no new component library, no `<table>` element (this codebase has none), no Tailwind config changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind v4 with the existing `yz-*` semantic color tokens (light/dark handled automatically — never use raw colors or `dark:` variants), no form library (plain `useState`), no toast library (`StatusMessage` banners only), auth via bearer token in `localStorage` through the shared `apiRequest` client.

## Global Constraints

- Frontend only. Do not modify anything under `node/` unless a genuine blocking bug is found in W0 (none is currently known — see the name-resolution note below, which is solved entirely client-side without touching the backend).
- Do not create any file under `web/app/api/` — every Work data call goes through `apiRequest` to the Express backend (`NEXT_PUBLIC_API_URL`, default `http://localhost:5000`).
- The Work nav item **already exists** in `web/components/app/profile/nav.tsx` (`{ href: "/work", label: "Work", icon: ... }`) — do not add or edit it. Building the three routes below is the only work needed to make it resolve instead of 404.
- Reuse `useProfile()` (`components/app/profile/profile-provider.tsx`) for the current user — never re-fetch the profile or re-check the token; `AppShell`/`ProfileProvider` already guarantee an authenticated context by the time a page under `app/(app)/` renders.
- The backend is the sole authority on visibility and permission. The frontend may use fields the backend already returned (`createdBy`, `activeAssignment.assigneeProfileId`) to decide **which controls to show** (exactly the pattern `organisation`'s `canAdminister`/`PeoplePanel` already uses) — this is a UX convenience, not an authorization decision, because the backend independently re-enforces every rule on every write and returns 403/404 regardless of what the frontend showed.
- **Name resolution note (not a backend bug):** `GET /api/work` and `GET /api/work/:id` return `createdBy`/`assigneeProfileId`/`assignedBy` as bare profile ids — W0 was deliberately minimal and does not join names server-side. The fix is entirely client-side: reuse `fetchOrganisationPeople(organisationId)` from `lib/organisation.ts` (already needed for the assignee picker) to build an id→name lookup from its `profileId` field. This is the same reference-data-by-id pattern the app already uses elsewhere; it does not require touching `node/`.
- W0 has no query params for search/filter/sort/view on `GET /api/work` — it returns every visible item in one response. "My Work"/"Assigned by Me", search, status filter, and sort are all **client-side operations over already-authorized data**, never a re-decision of visibility.
- Known, accepted limitation: a Work Item visible only because the caller was a *past* (not current) assignee or assigner will not appear in either "My Work" or "Assigned by Me" (both tabs use current-state fields only: active assignee, and creator). This is a rare edge case (requires at least one reassignment away from a non-creator) and out of scope for W0's two named views — flag it in the final report, do not add a third tab to work around it.
- Status vocabulary is fixed and hardcoded (`not_started | in_progress | blocked | waiting_review | done`), matching how membership/invitation statuses are already hardcoded as literal `<option>`s elsewhere in this codebase — no backend reference endpoint exists or is needed for this.
- Do not build: departments, teams, task hierarchy, projects, tenders, contracts, cross-organisation visibility, ratings, CV integration, Work notifications, evidence/files, dependencies. Naming stays generic (`WorkItem`, `WorkAssignment`, `assigneeProfileId`) so these can extend the model later without a rename.

---

### Task 1: `lib/format.ts` — two small date helpers

**Files:**
- Modify: `web/lib/format.ts` (append after `formatMonthYear`)

**Interfaces:**
- Produces: `formatShortDate(iso: string | null): string | null`, `formatRelativeDay(iso: string): string` — consumed by `work-row.tsx` and `work-detail-screen.tsx`.

- [ ] **Step 1: Append the two functions**

Add at the end of `web/lib/format.ts`:

```ts
/** "Sep 30" — compact, for due dates in a list or detail view. */
export function formatShortDate(iso: string | null): string | null {
  if (!iso) {
    return null;
  }

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * "Today", "Yesterday", or the short date beyond that — the wording an
 * "Updated" column reads at a glance rather than a full timestamp.
 */
export function formatRelativeDay(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

  const dayDiff = Math.round(
    (startOf(now) - startOf(date)) / (24 * 60 * 60 * 1000),
  );

  if (dayDiff === 0) {
    return "Today";
  }

  if (dayDiff === 1) {
    return "Yesterday";
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/lib/format.ts
git commit -m "feat(work): add short-date and relative-day formatters"
```

---

### Task 2: `lib/work.ts` — types and API client

**Files:**
- Create: `web/lib/work.ts`

**Interfaces:**
- Consumes: `apiRequest` from `./api`.
- Produces: `WorkItem`, `WorkAssignment`, `WorkItemSummary`, `WorkStatus`, `WORK_STATUS_OPTIONS`, `workStatusLabel(status)`, `fetchWorkItems()`, `fetchWorkItem(id)`, `createWorkItem(input)`, `updateWorkItem(id, input)`, `assignWorkItem(id, input)`, `CreateWorkInput`, `UpdateWorkInput`, `AssignWorkInput` — all consumed by every Work component in later tasks.

- [ ] **Step 1: Write the file**

```ts
import { apiRequest } from "./api";

/* ------------------------------------------------------------------------
   Shapes, mirroring what node/src/work serialises
   --------------------------------------------------------------------- */

export const WORK_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "waiting_review",
  "done",
] as const;

export type WorkStatus = (typeof WORK_STATUSES)[number];

export type WorkItem = {
  id: number;
  organisationId: number;
  title: string;
  description: string | null;
  expectedOutput: string | null;
  status: WorkStatus;
  progress: number;
  dueAt: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

/** active | completed | cancelled | reassigned. Never deleted. */
export type WorkAssignment = {
  id: number;
  workItemId: number;
  assignedBy: number;
  assigneeProfileId: number;
  instructions: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkItemSummary = WorkItem & {
  activeAssignment: WorkAssignment | null;
};

/* ------------------------------------------------------------------------
   Status vocabulary — W0 supports exactly these five, and no more. There is
   no backend reference endpoint for this; it is fixed and hardcoded, the
   same way membership/invitation statuses already are elsewhere in the app.
   --------------------------------------------------------------------- */

export const WORK_STATUS_OPTIONS: { value: WorkStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "waiting_review", label: "Waiting review" },
  { value: "done", label: "Done" },
];

export function workStatusLabel(status: string): string {
  return (
    WORK_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status
  );
}

/* ------------------------------------------------------------------------
   Calls
   --------------------------------------------------------------------- */

export function fetchWorkItems(): Promise<{ workItems: WorkItemSummary[] }> {
  return apiRequest("/api/work");
}

export function fetchWorkItem(id: number): Promise<{
  workItem: WorkItem;
  activeAssignment: WorkAssignment | null;
  assignmentHistory: WorkAssignment[];
}> {
  return apiRequest(`/api/work/${id}`);
}

export type CreateWorkInput = {
  organisationId: number;
  title: string;
  description: string | null;
  expectedOutput: string | null;
  dueAt: string | null;
  assigneeProfileId: number;
};

export function createWorkItem(input: CreateWorkInput): Promise<{
  message: string;
  workItem: WorkItem;
  assignment: WorkAssignment;
}> {
  return apiRequest("/api/work", { method: "POST", body: input });
}

export type UpdateWorkInput = Partial<{
  title: string;
  description: string | null;
  expectedOutput: string | null;
  dueAt: string | null;
  status: WorkStatus;
  progress: number;
}>;

export function updateWorkItem(
  id: number,
  input: UpdateWorkInput,
): Promise<{ message: string; workItem: WorkItem }> {
  return apiRequest(`/api/work/${id}`, { method: "PATCH", body: input });
}

export type AssignWorkInput = {
  assigneeProfileId: number;
  instructions: string | null;
};

export function assignWorkItem(
  id: number,
  input: AssignWorkInput,
): Promise<{ message: string; assignment: WorkAssignment }> {
  return apiRequest(`/api/work/${id}/assign`, { method: "POST", body: input });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/lib/work.ts
git commit -m "feat(work): add typed API client for the Work backend"
```

---

### Task 3: `WorkStatusPill` and `WorkProgress` — small display primitives

**Files:**
- Create: `web/components/app/work/work-status-pill.tsx`
- Create: `web/components/app/work/work-progress.tsx`

**Interfaces:**
- Consumes: `StatusPill` from `@/components/ui/status-pill`; `workStatusLabel`, `WorkStatus` from `@/lib/work`.
- Produces: `WorkStatusPill({ status })`, `WorkProgress({ value, className? })` — consumed by `work-row.tsx` and `work-detail-screen.tsx`.

- [ ] **Step 1: Write `work-status-pill.tsx`**

```tsx
import { StatusPill } from "@/components/ui/status-pill";
import { workStatusLabel, type WorkStatus } from "@/lib/work";

/**
 * not_started reads neutral, blocked reads as a problem, waiting_review and
 * in_progress both read as "in motion, keep an eye on it", done reads
 * resolved — a restrained accent, not a traffic light.
 */
export function WorkStatusPill({ status }: { status: WorkStatus | string }) {
  const tone =
    status === "blocked"
      ? "danger"
      : status === "done"
        ? "ok"
        : status === "not_started"
          ? "muted"
          : "warn";

  return <StatusPill tone={tone}>{workStatusLabel(status)}</StatusPill>;
}
```

- [ ] **Step 2: Write `work-progress.tsx`**

```tsx
/** A thin filled bar plus the percentage, for a Work Item's progress. */
export function WorkProgress({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-16 overflow-hidden rounded-full bg-yz-neutral-200"
      >
        <span
          className="block h-full rounded-full bg-yz-ink"
          style={{ width: `${clamped}%` }}
        />
      </span>

      <span className="w-8 shrink-0 text-[12px] tabular-nums text-yz-neutral-700">
        {clamped}%
      </span>
    </span>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/components/app/work/work-status-pill.tsx web/components/app/work/work-progress.tsx
git commit -m "feat(work): add status pill and progress bar primitives"
```

---

### Task 4: `AssigneeSelect` — the person picker shared by create and reassign

**Files:**
- Create: `web/components/app/work/assignee-select.tsx`

**Interfaces:**
- Consumes: `SelectField` from `@/components/ui/field`; `Member` from `@/lib/organisation`.
- Produces: `AssigneeSelect({ id, label, members, value, error?, hint?, onChange })` — consumed by `work-create-screen.tsx` and `work-detail-screen.tsx`.

- [ ] **Step 1: Write the file**

```tsx
import { SelectField } from "@/components/ui/field";
import type { Member } from "@/lib/organisation";

/**
 * People eligible to receive Work: active members of the organisation, named
 * by whatever Yahzel actually knows them as. W0 assigns to a person only —
 * never a team or a department — so this stays a plain select of people.
 */
export function AssigneeSelect({
  id,
  label,
  members,
  value,
  error,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  members: Member[];
  value: string;
  error?: string;
  hint?: string;
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

      {eligible.map((member) => (
        <option key={member.profileId} value={member.profileId ?? ""}>
          {member.fullName ?? member.email ?? `Member #${member.profileId}`}
        </option>
      ))}
    </SelectField>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/app/work/assignee-select.tsx
git commit -m "feat(work): add shared assignee picker"
```

---

### Task 5: `WorkRow` — the list row and its header

**Files:**
- Create: `web/components/app/work/work-row.tsx`

**Interfaces:**
- Consumes: `formatRelativeDay`, `formatShortDate` from `@/lib/format`; `WorkItemSummary` from `@/lib/work`; `WorkProgress`, `WorkStatusPill` from this task's sibling files.
- Produces: `WorkRowHeader()`, `WorkRow({ item, ownerName })` — consumed by `work-list-screen.tsx`.

Desktop renders one CSS-grid-aligned row (the "table" feel the spec asks for, without introducing an actual `<table>` element — this codebase has none). Below the `sm` breakpoint the same row collapses to a two-line stacked summary (title + status on one line, owner/progress/due/updated as a wrapped meta line) — the same technique `OrganisationCard` already uses, so the row never shrinks columns into unreadable text.

- [ ] **Step 1: Write the file**

```tsx
import Link from "next/link";

import { formatRelativeDay, formatShortDate } from "@/lib/format";
import type { WorkItemSummary } from "@/lib/work";
import { WorkProgress } from "./work-progress";
import { WorkStatusPill } from "./work-status-pill";

const GRID =
  "grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]";

export function WorkRowHeader() {
  return (
    <div
      className={`hidden border-b border-yz-neutral-200 pb-2 text-[11px] font-bold tracking-[0.04em] text-yz-neutral-600 uppercase sm:grid sm:items-center sm:gap-3 ${GRID}`}
    >
      <span>Work</span>
      <span>Owner</span>
      <span>Status</span>
      <span>Progress</span>
      <span>Due</span>
      <span>Updated</span>
    </div>
  );
}

export function WorkRow({
  item,
  ownerName,
}: {
  item: WorkItemSummary;
  /**
   * Resolved client-side from the organisation's member list — the Work API
   * only returns ids (see the plan's Global Constraints note), and this
   * screen already has the list for the assignee picker.
   */
  ownerName: string | null;
}) {
  const overdue =
    item.dueAt !== null &&
    item.status !== "done" &&
    new Date(item.dueAt).getTime() < Date.now();

  const owner = item.activeAssignment ? (ownerName ?? "Unknown") : "Unassigned";

  return (
    <Link
      href={`/work/${item.id}`}
      className="-mx-2 block rounded-sm px-2 py-2.5 transition-colors duration-150 hover:bg-yz-neutral-100"
    >
      {/* Desktop: one aligned row */}
      <div className={`hidden items-center gap-3 sm:grid ${GRID}`}>
        <span className="min-w-0 truncate text-[13.5px] font-semibold text-yz-ink">
          {item.title}
        </span>

        <span className="min-w-0 truncate text-[12.5px] text-yz-neutral-700">
          {owner}
        </span>

        <span>
          <WorkStatusPill status={item.status} />
        </span>

        <span>
          <WorkProgress value={item.progress} />
        </span>

        <span
          className={`text-[12.5px] tabular-nums ${
            overdue ? "text-yz-danger-ink" : "text-yz-neutral-700"
          }`}
        >
          {formatShortDate(item.dueAt) ?? "—"}
        </span>

        <span className="text-[12.5px] tabular-nums text-yz-neutral-600">
          {formatRelativeDay(item.updatedAt)}
        </span>
      </div>

      {/* Mobile/tablet: stacked two-line summary */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[13.5px] font-semibold text-yz-ink">
            {item.title}
          </span>

          <WorkStatusPill status={item.status} />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-yz-neutral-600">
          <span className="truncate">{owner}</span>

          <WorkProgress value={item.progress} />

          <span className={overdue ? "text-yz-danger-ink" : undefined}>
            Due {formatShortDate(item.dueAt) ?? "—"}
          </span>

          <span>Updated {formatRelativeDay(item.updatedAt)}</span>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/app/work/work-row.tsx
git commit -m "feat(work): add responsive work list row"
```

---

### Task 6: `/work` — the list page

**Files:**
- Create: `web/components/app/work/work-list-screen.tsx`
- Create: `web/app/(app)/work/page.tsx`

**Interfaces:**
- Consumes: `useProfile` from `../profile/profile-provider`; `fetchOrganisationPeople`, `Member` from `@/lib/organisation`; `fetchWorkItems`, `WORK_STATUS_OPTIONS`, `WorkItemSummary` from `@/lib/work`; `WorkRow`, `WorkRowHeader` from `./work-row`; `Button`, `SelectField`, `TextField`, `PageHeader`, `Panel`, `PanelGroup`, `StatusMessage`, `ApiError`.
- Produces: `WorkListScreen()`, mounted at route `/work`.

- [ ] **Step 1: Write `work-list-screen.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import {
  PageHeader,
  Panel,
  PanelGroup,
  StatusMessage,
} from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchOrganisationPeople, type Member } from "@/lib/organisation";
import {
  fetchWorkItems,
  WORK_STATUS_OPTIONS,
  type WorkItemSummary,
} from "@/lib/work";
import { useProfile } from "../profile/profile-provider";
import { WorkRow, WorkRowHeader } from "./work-row";

type View = "mine" | "assigned";
type SortKey = "updated" | "due" | "progress" | "title";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

/**
 * Every Work Item the person is authorized to see, as one list with two
 * lenses over it. The backend already decided what is visible — "My Work"
 * and "Assigned by Me" only split that already-authorized set for display,
 * they never grant access to anything the API did not return.
 */
export function WorkListScreen() {
  const { profile } = useProfile();

  const [items, setItems] = useState<WorkItemSummary[] | null>(null);
  const [ownerNames, setOwnerNames] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>("mine");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");

  const load = useCallback(async () => {
    try {
      const { workItems } = await fetchWorkItems();

      setItems(workItems);
      setError(null);

      // The Work API returns ids, not names (see the plan's Global
      // Constraints). Resolve them from the same organisation member lists
      // the assignee picker uses — one request per distinct organisation
      // among the returned items.
      const organisationIds = [
        ...new Set(workItems.map((item) => item.organisationId)),
      ];

      const memberLists = await Promise.all(
        organisationIds.map((id) =>
          fetchOrganisationPeople(id).catch(() => ({ members: [] as Member[] })),
        ),
      );

      const names = new Map<number, string>();

      for (const { members } of memberLists) {
        for (const member of members) {
          if (member.profileId !== null) {
            names.set(
              member.profileId,
              member.fullName ?? member.email ?? "Unknown",
            );
          }
        }
      }

      setOwnerNames(names);
    } catch (caught) {
      setError(failureMessage(caught));
    }
  }, []);

  useEffect(() => {
    // Synchronising with an external system — the Yahzel API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const scoped = useMemo(() => {
    if (!items || !profile) {
      return [];
    }

    const byView =
      view === "mine"
        ? items.filter(
            (item) => item.activeAssignment?.assigneeProfileId === profile.id,
          )
        : items.filter((item) => item.createdBy === profile.id);

    const term = search.trim().toLowerCase();

    const bySearch = term
      ? byView.filter((item) => item.title.toLowerCase().includes(term))
      : byView;

    const byStatus = statusFilter
      ? bySearch.filter((item) => item.status === statusFilter)
      : bySearch;

    return [...byStatus].sort((a, b) => {
      if (sort === "title") {
        return a.title.localeCompare(b.title);
      }

      if (sort === "progress") {
        return b.progress - a.progress;
      }

      if (sort === "due") {
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [items, profile, view, search, statusFilter, sort]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Work"
        description="Standalone Work Items you create and assign directly to someone."
        actions={
          <Link
            href="/work/new"
            className="inline-flex items-center rounded-sm border border-yz-ink bg-yz-ink px-4 py-2 text-[13px] font-bold text-yz-ink-contrast transition-opacity duration-150 hover:opacity-90"
          >
            + New Work
          </Link>
        }
      />

      {error && (
        <StatusMessage tone="error">
          {error}{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="font-bold underline underline-offset-4"
          >
            Try again
          </button>
        </StatusMessage>
      )}

      <Panel>
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
          <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
            <TextField
              id="workSearch"
              label="Search"
              placeholder="Search by title…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <SelectField
              id="workStatusFilter"
              label="Status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>

              {WORK_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="workSort"
              label="Sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
            >
              <option value="updated">Recently updated</option>
              <option value="due">Due soonest</option>
              <option value="progress">Progress</option>
              <option value="title">Title (A–Z)</option>
            </SelectField>
          </div>

          {items === null ? (
            <p className="text-[13px] text-yz-neutral-600">Loading…</p>
          ) : scoped.length === 0 ? (
            <p className="text-[13px] leading-6 text-yz-neutral-600">
              {view === "mine"
                ? "There is currently no Work assigned to you."
                : "You have not assigned any Work yet."}
            </p>
          ) : (
            <div>
              <WorkRowHeader />

              <div className="divide-y divide-yz-neutral-200">
                {scoped.map((item) => (
                  <WorkRow
                    key={item.id}
                    item={item}
                    ownerName={
                      item.activeAssignment
                        ? (ownerNames.get(
                            item.activeAssignment.assigneeProfileId,
                          ) ?? null)
                        : null
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(app)/work/page.tsx`**

```tsx
import type { Metadata } from "next";

import { WorkListScreen } from "@/components/app/work/work-list-screen";

export const metadata: Metadata = { title: "Work" };

export default function WorkPage() {
  return <WorkListScreen />;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/components/app/work/work-list-screen.tsx "web/app/(app)/work/page.tsx"
git commit -m "feat(work): add the Work list page with My Work / Assigned by Me views"
```

---

### Task 7: `/work/new` — the create form

**Files:**
- Create: `web/components/app/work/work-create-screen.tsx`
- Create: `web/app/(app)/work/new/page.tsx`

**Interfaces:**
- Consumes: `fetchParticipation`, `fetchOrganisationPeople`, `Member`, `Participation` from `@/lib/organisation`; `createWorkItem` from `@/lib/work`; `AssigneeSelect` from `./assignee-select`.
- Produces: `WorkCreateScreen()`, mounted at route `/work/new`.

- [ ] **Step 1: Write `work-create-screen.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import {
  PageHeader,
  Panel,
  PanelGroup,
  StatusMessage,
} from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import {
  fetchOrganisationPeople,
  fetchParticipation,
  type Member,
  type Participation,
} from "@/lib/organisation";
import { createWorkItem } from "@/lib/work";
import { AssigneeSelect } from "./assignee-select";

const EMPTY = {
  title: "",
  description: "",
  expectedOutput: "",
  dueAt: "",
  assigneeProfileId: "",
};

/**
 * Creating a standalone Work Item. W0 has no project/tender/contract for
 * this to belong to — it only needs an organisation, so both people can be
 * confirmed as active members of the same one, and a person to hand it to.
 */
export function WorkCreateScreen() {
  const router = useRouter();

  const [organisations, setOrganisations] = useState<Participation[] | null>(
    null,
  );
  const [organisationId, setOrganisationId] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { participation } = await fetchParticipation();
        const active = participation.filter(
          (entry) => entry.membership.status === "active",
        );

        setOrganisations(active);

        if (active.length === 1 && active[0]) {
          setOrganisationId(active[0].organisation.id);
        }
      } catch (caught) {
        setLoadError(
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Please try again.",
        );
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  useEffect(() => {
    if (organisationId === null) {
      setMembers([]);
      return;
    }

    async function loadMembers(id: number) {
      try {
        const { members: next } = await fetchOrganisationPeople(id);
        setMembers(next);
      } catch {
        setMembers([]);
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMembers(organisationId);
  }, [organisationId]);

  function update(key: keyof typeof EMPTY, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setMessage(null);
  }

  async function submit() {
    if (!organisationId) {
      setMessage("Choose an organisation first.");
      return;
    }

    setSaving(true);
    setErrors({});
    setMessage(null);

    try {
      const { workItem } = await createWorkItem({
        organisationId,
        title: form.title,
        description: form.description || null,
        expectedOutput: form.expectedOutput || null,
        dueAt: form.dueAt || null,
        assigneeProfileId: Number(form.assigneeProfileId),
      });

      router.push(`/work/${workItem.id}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.byField());
        setMessage(caught.errors.length === 0 ? caught.message : null);
      } else {
        setMessage("Something went wrong. Please try again.");
      }

      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="New Work"
        description="A standalone Work Item, assigned directly to someone in your organisation."
        actions={
          <Link
            href="/work"
            className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
          >
            Back
          </Link>
        }
      />

      {loadError && <StatusMessage tone="error">{loadError}</StatusMessage>}
      {message && <StatusMessage tone="error">{message}</StatusMessage>}

      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <PanelGroup title="Details">
            <div className="grid max-w-xl gap-3">
              {organisations && organisations.length > 1 && (
                <SelectField
                  id="workOrganisation"
                  label="Organisation"
                  value={organisationId ?? ""}
                  onChange={(event) =>
                    setOrganisationId(Number(event.target.value) || null)
                  }
                >
                  <option value="">Choose an organisation</option>

                  {organisations.map((entry) => (
                    <option
                      key={entry.organisation.id}
                      value={entry.organisation.id}
                    >
                      {entry.organisation.name}
                    </option>
                  ))}
                </SelectField>
              )}

              <TextField
                id="workTitle"
                label="Title"
                value={form.title}
                error={errors.title}
                onChange={(event) => update("title", event.target.value)}
              />

              <TextAreaField
                id="workDescription"
                label="Description"
                hint="Optional. What this Work is about."
                value={form.description}
                error={errors.description}
                onChange={(event) => update("description", event.target.value)}
              />

              <TextAreaField
                id="workExpectedOutput"
                label="Expected output"
                hint="Optional. What finishing this looks like."
                value={form.expectedOutput}
                error={errors.expectedOutput}
                onChange={(event) =>
                  update("expectedOutput", event.target.value)
                }
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  id="workDueAt"
                  label="Due date"
                  type="date"
                  hint="Optional."
                  value={form.dueAt}
                  error={errors.dueAt}
                  onChange={(event) => update("dueAt", event.target.value)}
                />

                <AssigneeSelect
                  id="workAssignee"
                  label="Assignee"
                  members={members}
                  value={form.assigneeProfileId}
                  error={errors.assigneeProfileId}
                  hint={
                    organisationId ? undefined : "Choose an organisation first."
                  }
                  onChange={(value) => update("assigneeProfileId", value)}
                />
              </div>
            </div>
          </PanelGroup>

          <div className="flex items-center gap-2 py-4">
            <Button
              type="submit"
              variant="primary"
              disabled={saving || !organisationId}
            >
              {saving ? "Creating…" : "Create Work"}
            </Button>

            <Link
              href="/work"
              className="px-3 py-1.5 text-[12px] font-bold text-yz-neutral-700 hover:text-yz-ink"
            >
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(app)/work/new/page.tsx`**

```tsx
import type { Metadata } from "next";

import { WorkCreateScreen } from "@/components/app/work/work-create-screen";

export const metadata: Metadata = { title: "New Work" };

export default function NewWorkPage() {
  return <WorkCreateScreen />;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/components/app/work/work-create-screen.tsx "web/app/(app)/work/new/page.tsx"
git commit -m "feat(work): add the Work create form"
```

---

### Task 8: `/work/[id]` — the detail page (view, edit, reassign, history)

**Files:**
- Create: `web/components/app/work/work-detail-screen.tsx`
- Create: `web/app/(app)/work/[id]/page.tsx`

**Interfaces:**
- Consumes: `useProfile`; `ReadRow` from `../profile/profile-section`; `fetchOrganisationPeople`, `Member` from `@/lib/organisation`; `fetchWorkItem`, `updateWorkItem`, `assignWorkItem`, `WORK_STATUS_OPTIONS`, `WorkItem`, `WorkAssignment` from `@/lib/work`; `AssigneeSelect`; `WorkStatusPill`; `WorkProgress`; `formatShortDate` from `@/lib/format`.
- Produces: `WorkDetailScreen({ workItemId })`, mounted at route `/work/[id]`.

- [ ] **Step 1: Write `work-detail-screen.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import {
  PageHeader,
  Panel,
  PanelGroup,
  StatusMessage,
} from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { fetchOrganisationPeople, type Member } from "@/lib/organisation";
import {
  assignWorkItem,
  fetchWorkItem,
  updateWorkItem,
  WORK_STATUS_OPTIONS,
  type WorkAssignment,
  type WorkItem,
} from "@/lib/work";
import { ReadRow } from "../profile/profile-section";
import { useProfile } from "../profile/profile-provider";
import { AssigneeSelect } from "./assignee-select";
import { WorkProgress } from "./work-progress";
import { WorkStatusPill } from "./work-status-pill";

type Status = { tone: "ok" | "error"; message: string } | null;

const EMPTY_ASSIGN = { assigneeProfileId: "", instructions: "" };

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

function formFromItem(item: WorkItem) {
  return {
    title: item.title,
    description: item.description ?? "",
    expectedOutput: item.expectedOutput ?? "",
    dueAt: item.dueAt ? item.dueAt.slice(0, 10) : "",
    status: item.status as string,
    progress: String(item.progress),
  };
}

/** active reads current, cancelled reads as a stop, everything else neutral. */
function AssignmentStatusPill({ status }: { status: string }) {
  return (
    <StatusPill
      tone={
        status === "active" ? "ok" : status === "cancelled" ? "danger" : "muted"
      }
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </StatusPill>
  );
}

/**
 * One Work Item: what it is, who created it, who currently owns it, who
 * assigned it, and the full chain of assignments before that — nothing here
 * is ever overwritten or hidden, matching the backend's own history model.
 */
export function WorkDetailScreen({ workItemId }: { workItemId: number }) {
  const { profile } = useProfile();

  const [workItem, setWorkItem] = useState<WorkItem | null>(null);
  const [activeAssignment, setActiveAssignment] =
    useState<WorkAssignment | null>(null);
  const [history, setHistory] = useState<WorkAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => formFromItem({
    id: 0, organisationId: 0, title: "", description: null, expectedOutput: null,
    status: "not_started", progress: 0, dueAt: null, createdBy: 0,
    createdAt: "", updatedAt: "",
  }));
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editStatus, setEditStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  const [reassigning, setReassigning] = useState(false);
  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGN);
  const [assignErrors, setAssignErrors] = useState<Record<string, string>>({});
  const [assignStatus, setAssignStatus] = useState<Status>(null);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchWorkItem(workItemId);

      setWorkItem(result.workItem);
      setActiveAssignment(result.activeAssignment);
      setHistory(result.assignmentHistory);
      setForm(formFromItem(result.workItem));
      setError(null);
      setNotFound(false);

      try {
        const { members: next } = await fetchOrganisationPeople(
          result.workItem.organisationId,
        );

        setMembers(next);
      } catch {
        // Names and reassignment become unavailable, but the Work Item
        // itself must still render.
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setNotFound(true);
        return;
      }

      setError(failureMessage(caught));
    }
  }, [workItemId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function nameFor(profileId: number): string {
    const member = members.find((entry) => entry.profileId === profileId);
    return member?.fullName ?? member?.email ?? `Person #${profileId}`;
  }

  async function saveEdit() {
    if (!workItem) {
      return;
    }

    setSaving(true);
    setEditErrors({});
    setEditStatus(null);

    try {
      const { message } = await updateWorkItem(workItem.id, {
        title: form.title,
        description: form.description || null,
        expectedOutput: form.expectedOutput || null,
        dueAt: form.dueAt || null,
        status: form.status as WorkItem["status"],
        progress: Number(form.progress),
      });

      setEditStatus({ tone: "ok", message });
      setEditing(false);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setEditErrors(caught.byField());

        if (caught.errors.length === 0) {
          setEditStatus({ tone: "error", message: caught.message });
        }
      } else {
        setEditStatus({ tone: "error", message: failureMessage(caught) });
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitReassign() {
    if (!workItem) {
      return;
    }

    setAssigning(true);
    setAssignErrors({});
    setAssignStatus(null);

    try {
      const { message } = await assignWorkItem(workItem.id, {
        assigneeProfileId: Number(assignForm.assigneeProfileId),
        instructions: assignForm.instructions || null,
      });

      setAssignStatus({ tone: "ok", message });
      setReassigning(false);
      setAssignForm(EMPTY_ASSIGN);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setAssignErrors(caught.byField());

        if (caught.errors.length === 0) {
          setAssignStatus({ tone: "error", message: caught.message });
        }
      } else {
        setAssignStatus({ tone: "error", message: failureMessage(caught) });
      }
    } finally {
      setAssigning(false);
    }
  }

  if (notFound) {
    return (
      <div className="space-y-3">
        <PageHeader title="Work" />

        <StatusMessage tone="error">
          That work item could not be found.{" "}
          <Link href="/work" className="font-bold underline underline-offset-4">
            Back to Work
          </Link>
        </StatusMessage>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <PageHeader title="Work" />

        <StatusMessage tone="error">
          {error}{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="font-bold underline underline-offset-4"
          >
            Try again
          </button>
        </StatusMessage>
      </div>
    );
  }

  if (!workItem) {
    return <p className="text-[13px] text-yz-neutral-600">Loading…</p>;
  }

  const isCreator = profile?.id === workItem.createdBy;
  const isOwner = profile?.id === activeAssignment?.assigneeProfileId;
  const canEdit = isCreator || isOwner;

  return (
    <div className="space-y-3">
      <PageHeader
        title={workItem.title}
        description={`Created ${formatShortDate(workItem.createdAt)}`}
        actions={
          <Link
            href="/work"
            className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
          >
            All Work
          </Link>
        }
      />

      <Panel>
        <PanelGroup
          title="Overview"
          trailing={
            canEdit &&
            !editing && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )
          }
        >
          {editStatus && (
            <StatusMessage tone={editStatus.tone} className="mb-3">
              {editStatus.message}
            </StatusMessage>
          )}

          {!editing ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <WorkStatusPill status={workItem.status} />
                <WorkProgress value={workItem.progress} />
              </div>

              <dl>
                <ReadRow label="Description" value={workItem.description} />
                <ReadRow
                  label="Expected output"
                  value={workItem.expectedOutput}
                />
                <ReadRow
                  label="Due date"
                  value={formatShortDate(workItem.dueAt)}
                />
              </dl>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveEdit();
              }}
            >
              <div className="grid gap-3">
                <TextField
                  id="editTitle"
                  label="Title"
                  value={form.title}
                  error={editErrors.title}
                  onChange={(event) =>
                    setForm((c) => ({ ...c, title: event.target.value }))
                  }
                />

                <TextAreaField
                  id="editDescription"
                  label="Description"
                  value={form.description}
                  error={editErrors.description}
                  onChange={(event) =>
                    setForm((c) => ({ ...c, description: event.target.value }))
                  }
                />

                <TextAreaField
                  id="editExpectedOutput"
                  label="Expected output"
                  value={form.expectedOutput}
                  error={editErrors.expectedOutput}
                  onChange={(event) =>
                    setForm((c) => ({
                      ...c,
                      expectedOutput: event.target.value,
                    }))
                  }
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField
                    id="editDueAt"
                    label="Due date"
                    type="date"
                    value={form.dueAt}
                    error={editErrors.dueAt}
                    onChange={(event) =>
                      setForm((c) => ({ ...c, dueAt: event.target.value }))
                    }
                  />

                  <SelectField
                    id="editStatus"
                    label="Status"
                    value={form.status}
                    error={editErrors.status}
                    onChange={(event) =>
                      setForm((c) => ({ ...c, status: event.target.value }))
                    }
                  >
                    {WORK_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>

                  <TextField
                    id="editProgress"
                    label="Progress"
                    type="number"
                    min={0}
                    max={100}
                    value={form.progress}
                    error={editErrors.progress}
                    onChange={(event) =>
                      setForm((c) => ({ ...c, progress: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setForm(formFromItem(workItem));
                    setEditErrors({});
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </PanelGroup>

        <PanelGroup
          title="People"
          trailing={
            isCreator &&
            !reassigning && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setReassigning(true)}
              >
                Reassign
              </Button>
            )
          }
        >
          {assignStatus && (
            <StatusMessage tone={assignStatus.tone} className="mb-3">
              {assignStatus.message}
            </StatusMessage>
          )}

          <dl>
            <ReadRow label="Created by" value={nameFor(workItem.createdBy)} />

            <ReadRow
              label="Currently assigned to"
              value={
                activeAssignment
                  ? nameFor(activeAssignment.assigneeProfileId)
                  : "Nobody — reassign to give this an owner"
              }
            />

            {activeAssignment && (
              <ReadRow
                label="Assigned by"
                value={nameFor(activeAssignment.assignedBy)}
              />
            )}

            {activeAssignment?.instructions && (
              <ReadRow
                label="Instructions"
                value={activeAssignment.instructions}
              />
            )}
          </dl>

          {reassigning && (
            <form
              className="mt-3 rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 p-3.5"
              onSubmit={(event) => {
                event.preventDefault();
                void submitReassign();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <AssigneeSelect
                  id="reassignTo"
                  label="Reassign to"
                  members={members}
                  value={assignForm.assigneeProfileId}
                  error={assignErrors.assigneeProfileId}
                  onChange={(value) =>
                    setAssignForm((c) => ({ ...c, assigneeProfileId: value }))
                  }
                />

                <TextField
                  id="reassignInstructions"
                  label="Instructions"
                  hint="Optional."
                  value={assignForm.instructions}
                  error={assignErrors.instructions}
                  onChange={(event) =>
                    setAssignForm((c) => ({
                      ...c,
                      instructions: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={assigning}
                >
                  {assigning ? "Reassigning…" : "Confirm reassignment"}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={assigning}
                  onClick={() => {
                    setReassigning(false);
                    setAssignForm(EMPTY_ASSIGN);
                    setAssignErrors({});
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </PanelGroup>

        <PanelGroup title="Assignment history">
          {history.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">
              No assignment history yet.
            </p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {history.map((assignment) => (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-yz-ink">
                      {nameFor(assignment.assigneeProfileId)}
                    </span>

                    <span className="block truncate text-[12px] text-yz-neutral-600">
                      Assigned by {nameFor(assignment.assignedBy)} ·{" "}
                      {formatShortDate(assignment.createdAt)}
                      {assignment.instructions
                        ? ` · ${assignment.instructions}`
                        : ""}
                    </span>
                  </span>

                  <AssignmentStatusPill status={assignment.status} />
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(app)/work/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";

import { WorkDetailScreen } from "@/components/app/work/work-detail-screen";

/**
 * The Work Item itself is loaded in the browser, behind the bearer token the
 * client holds — the same arrangement every other authenticated screen uses.
 * Only the id is resolved here.
 */
export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const workItemId = Number(id);

  if (!Number.isInteger(workItemId) || workItemId <= 0) {
    notFound();
  }

  return <WorkDetailScreen workItemId={workItemId} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. This is the point everything compiles together end to end.

- [ ] **Step 4: Commit**

```bash
git add web/components/app/work/work-detail-screen.tsx "web/app/(app)/work/[id]/page.tsx"
git commit -m "feat(work): add the Work detail page with edit, reassignment and history"
```

---

### Task 9: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `cd web && npm run lint`
Expected: no errors (warnings acceptable only if they already exist elsewhere in the codebase; fix anything new introduced by these files).

- [ ] **Step 3: Production build**

Run: `cd web && npm run build`
Expected: build succeeds, including the three new routes (`/work`, `/work/new`, `/work/[id]`) appearing in the route summary.

- [ ] **Step 4: Manual browser verification**

With both `node/` (`npm run dev`) and `web/` (`npm run dev`) running, sign in and walk through:
- Sidebar "Work" nav item now opens `/work` instead of 404.
- Create two Work Items as one user, assigned to a second organisation member (reuse the same manual flow the backend's `check-work-api.ts` used: two people in one organisation).
- `/work` shows both tabs; "My Work" shows items where the signed-in user is the active assignee, "Assigned by Me" shows items they created.
- Search, status filter, and sort all behave correctly against the same underlying list.
- Empty state text is correct for both tabs when filtered to nothing.
- Open a Work Item's detail page: title/description/expected output/status/progress/due date/creator/current assignee/instructions all render with real names (not raw ids).
- Edit the item (as creator or current assignee) — verify the PATCH round-trip and that status/progress normalization (e.g. setting status to "done" without touching progress) matches the backend's behavior.
- Reassign (as creator) to a third organisation member — verify the active assignee updates and the previous assignment appears in "Assignment history" with status "Reassigned", never removed.
- As a user with no relationship to a Work Item, confirm `/work/<id>` shows the "could not be found" message, not a raw error.
- Resize to mobile/tablet widths — confirm the list row collapses to the stacked summary and the detail page's panels remain usable (no horizontal scroll, no unreadable text).
- Toggle dark mode — confirm every new component (pills, progress bar, rows, forms) reads correctly in both themes without any hardcoded raw colors.

- [ ] **Step 5: Review the full diff**

Run: `git diff main --stat` (or `git status` plus per-file `git diff`)
Expected: only files under `web/lib/work.ts` (new), `web/lib/format.ts` (additive), `web/components/app/work/*` (new), `web/app/(app)/work/**/*.tsx` (new). No edits to `nav.tsx`, `sidebar.tsx`, `app-shell.tsx`, or any `organisation`/`profile`/`notifications` frontend file, and nothing under `node/`.

- [ ] **Step 6: Stop here**

Report per the original spec's structure (pages/routes, components, endpoints integrated, UI behaviour, responsive behaviour, checks performed, issues found, recommended next phase) and wait — do not start child tasks, projects, or any later phase automatically.
