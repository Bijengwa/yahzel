"use client";

import { useCallback, useEffect, useState } from "react";

import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchOverview, signalTypeLabel, type OrganisationOverview } from "@/lib/intelligence";
import { fetchOrganisation, type Organisation } from "@/lib/organisation";
import { OrganisationTabs } from "../organisation/organisation-tabs";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-yz-neutral-200 px-3.5 py-3">
      <div className="text-[20px] font-extrabold text-yz-ink">{value}</div>
      <div className="mt-0.5 text-[11.5px] font-bold uppercase tracking-wide text-yz-neutral-500">{label}</div>
    </div>
  );
}

/**
 * Factual current state, derived from Work/Projects/Outcomes/People/Attention
 * — never a productivity score. Section 4 of the Phase 6 spec: what an
 * organisation's operational state actually is, in one screen.
 */
export function OverviewScreen({ organisationId }: { organisationId: number }) {
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [overview, setOverview] = useState<OrganisationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const [orgResult, overviewResult] = await Promise.all([
        fetchOrganisation(organisationId),
        fetchOverview(organisationId),
      ]);

      setOrganisation(orgResult.organisation);
      setOverview(overviewResult);
      setError(null);
      setForbidden(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setForbidden(true);
      } else {
        setError(failureMessage(caught));
      }
    }
  }, [organisationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (forbidden) {
    return (
      <div className="space-y-3">
        <PageHeader title="Overview" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">Only an administrator can view this organisation&apos;s overview.</StatusMessage>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <PageHeader title="Overview" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">{error}</StatusMessage>
      </div>
    );
  }

  if (!overview || !organisation) {
    return <p className="text-[13px] text-yz-neutral-600">Loading…</p>;
  }

  const activeSignalEntries = Object.entries(overview.attention.byType).filter(([, count]) => count > 0);

  return (
    <div className="space-y-3">
      <PageHeader title="Overview" description={organisation.name} />
      <OrganisationTabs organisationId={organisationId} />

      <Panel>
        <PanelGroup title="People">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Active members" value={overview.people.activeMembers} />
            <Stat label="Occupied positions" value={overview.people.occupiedPositions} />
            <Stat label="Vacant positions" value={overview.people.vacantPositions} />
          </div>
        </PanelGroup>

        <PanelGroup title="Work">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Total" value={overview.work.total} />
            <Stat label="Open" value={overview.work.open} />
            <Stat label="Completed" value={overview.work.completed} />
            <Stat label="Overdue" value={overview.work.overdue} />
            <Stat label="Blocked" value={overview.work.blocked} />
            <Stat label="Stalled" value={overview.work.stalled} />
          </div>
        </PanelGroup>

        <PanelGroup title="Projects">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Active" value={overview.projects.active} />
            <Stat label="Paused" value={overview.projects.paused} />
            <Stat label="Completed" value={overview.projects.completed} />
            <Stat label="Requiring attention" value={overview.projects.requiringAttention} />
          </div>
        </PanelGroup>

        <PanelGroup title="Outcomes">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Total" value={overview.outcomes.total} />
            <Stat label="Open" value={overview.outcomes.open} />
            <Stat label="Completed" value={overview.outcomes.completed} />
            <Stat label="Overdue" value={overview.outcomes.overdue} />
            <Stat label="Approaching target" value={overview.outcomes.approachingTarget} />
          </div>
        </PanelGroup>

        <PanelGroup title={`Attention (${overview.attention.active})`}>
          {activeSignalEntries.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">Nothing needs attention right now.</p>
          ) : (
            <ul className="space-y-1.5">
              {activeSignalEntries.map(([type, count]) => (
                <li key={type} className="flex items-center justify-between text-[13px] text-yz-neutral-700">
                  <span>{signalTypeLabel(type)}</span>
                  <span className="font-bold text-yz-ink">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
