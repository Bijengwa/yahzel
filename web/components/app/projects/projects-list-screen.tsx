"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  PageHeader,
  Panel,
  PanelGroup,
  StatusMessage,
} from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchOrganisationPeople, type Member } from "@/lib/organisation";
import {
  fetchProjects,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type Project,
} from "@/lib/projects";
import { AdminOrganisationSelect } from "../work/admin-organisation-picker";
import { ProjectRow, ProjectRowHeader } from "./project-row";
import { useProjectOrganisation } from "./use-project-organisation";

const COMPACT_CONTROL =
  "h-8 rounded-sm border border-yz-neutral-300 bg-yz-panel px-2.5 text-[12.5px] text-yz-ink outline-none transition-colors duration-150 focus:border-yz-ink";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

export function ProjectsListScreen() {
  const { organisations, organisationId, setOrganisationId } =
    useProjectOrganisation();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [ownerNames, setOwnerNames] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async (orgId: number) => {
    try {
      const [{ projects: rows }, { members }] = await Promise.all([
        fetchProjects(orgId),
        fetchOrganisationPeople(orgId).catch(() => ({ members: [] as Member[] })),
      ]);

      setProjects(rows);
      setError(null);

      const names = new Map<number, string>();
      for (const member of members) {
        if (member.profileId !== null) {
          names.set(member.profileId, member.fullName ?? member.email ?? "Unknown");
        }
      }
      setOwnerNames(names);
    } catch (caught) {
      setError(failureMessage(caught));
    }
  }, []);

  useEffect(() => {
    if (organisationId === null) {
      // Resetting to the empty selection when the organisation is cleared,
      // not reacting to data fetched from an external system.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProjects(null);
      return;
    }

    void load(organisationId);
  }, [organisationId, load]);

  const scoped = useMemo(() => {
    if (!projects) {
      return [];
    }

    const byArchived = showArchived
      ? projects
      : projects.filter((project) => project.archivedAt === null);

    const byStatus = statusFilter
      ? byArchived.filter((project) => project.status === statusFilter)
      : byArchived;

    return [...byStatus].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [projects, statusFilter, showArchived]);

  const archivedCount = projects
    ? projects.filter((project) => project.archivedAt !== null).length
    : 0;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Projects"
        description="Coordination layer over the Work already happening — an owner, outcomes, and a traceable timeline."
        actions={
          organisationId && (
            <Link
              href={`/projects/new?organisationId=${organisationId}`}
              className="inline-flex items-center rounded-sm border border-yz-ink bg-yz-ink px-4 py-2 text-[13px] font-bold text-yz-ink-contrast transition-opacity duration-150 hover:opacity-90"
            >
              + New Project
            </Link>
          )
        }
      />

      {error && (
        <StatusMessage tone="error">
          {error}{" "}
          <button
            type="button"
            onClick={() => organisationId && void load(organisationId)}
            className="font-bold underline underline-offset-4"
          >
            Try again
          </button>
        </StatusMessage>
      )}

      <Panel>
        <PanelGroup
          title="Projects"
          trailing={
            organisations && (
              <AdminOrganisationSelect
                organisations={organisations}
                organisationId={organisationId}
                onChange={setOrganisationId}
              />
            )
          }
        >
          {organisationId === null ? (
            <p className="text-[13px] text-yz-neutral-600">
              {organisations === null
                ? "Loading…"
                : organisations.length === 0
                  ? "You are not an active member of any organisation yet."
                  : "Choose an organisation."}
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label htmlFor="projectStatusFilter" className="sr-only">
                  Filter by status
                </label>
                <select
                  id="projectStatusFilter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className={COMPACT_CONTROL}
                >
                  <option value="">All statuses</option>
                  {PROJECT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {PROJECT_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-1.5 text-[12.5px] text-yz-neutral-700">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(event) => setShowArchived(event.target.checked)}
                  />
                  Show archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
                </label>
              </div>

              {projects === null ? (
                error ? null : (
                  <p className="text-[13px] text-yz-neutral-600">Loading…</p>
                )
              ) : scoped.length === 0 ? (
                <p className="text-[13px] leading-6 text-yz-neutral-600">
                  {projects.length === 0
                    ? "No Projects yet in this organisation."
                    : "No Projects match your filters."}
                </p>
              ) : (
                <div>
                  <ProjectRowHeader />

                  <div className="divide-y divide-yz-neutral-200">
                    {scoped.map((project) => (
                      <ProjectRow
                        key={project.id}
                        project={project}
                        ownerName={ownerNames.get(project.ownerProfileId) ?? null}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
