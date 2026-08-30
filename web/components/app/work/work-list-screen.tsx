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

          {items === null && !error ? (
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
