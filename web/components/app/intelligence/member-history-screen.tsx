"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchMemberHistory, type MemberOperationalHistory } from "@/lib/intelligence";
import { OrganisationTabs } from "../organisation/organisation-tabs";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "present";
}

/**
 * One person's factual operational record in this organisation — never a
 * résumé, never a skills or rating inference. Everything here is a link back
 * to an existing authoritative record (membership, occupancy, employment,
 * Work, Projects, Outcomes).
 */
export function MemberHistoryScreen({
  organisationId,
  memberId,
}: {
  organisationId: number;
  memberId: number;
}) {
  const [history, setHistory] = useState<MemberOperationalHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchMemberHistory(organisationId, memberId);
      setHistory(result);
      setError(null);
      setForbidden(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setForbidden(true);
      } else {
        setError(failureMessage(caught));
      }
    }
  }, [organisationId, memberId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (forbidden) {
    return (
      <div className="space-y-3">
        <PageHeader title="Operational history" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">Only an administrator can view this person&apos;s operational history.</StatusMessage>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <PageHeader title="Operational history" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">{error}</StatusMessage>
      </div>
    );
  }

  if (!history) {
    return <p className="text-[13px] text-yz-neutral-600">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Operational history"
        description={history.membership.title ?? history.membership.organisationClassLabel}
      />
      <OrganisationTabs organisationId={organisationId} />

      <Panel>
        <PanelGroup title="Structure">
          {history.structure.positions.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No positions held.</p>
          ) : (
            <ul className="space-y-1 text-[12.5px] leading-6 text-yz-neutral-700">
              {history.structure.positions.map((row, index) => (
                <li key={index}>
                  {row.positionName ?? "Unknown position"} — {formatDate(row.startsAt)} to{" "}
                  {row.isActive ? "present" : formatDate(row.endsAt)}
                </li>
              ))}
            </ul>
          )}

          {history.structure.departments.length > 0 && (
            <p className="mt-2 text-[12.5px] text-yz-neutral-600">
              Departments: {history.structure.departments.map((d) => d.name).join(", ")}
            </p>
          )}
        </PanelGroup>

        <PanelGroup title="Employment">
          {history.employment.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No employment records.</p>
          ) : (
            <ul className="space-y-2">
              {history.employment.map((entry) => (
                <li key={entry.employmentRecord.id} className="text-[12.5px] leading-6 text-yz-neutral-700">
                  <span className="font-semibold text-yz-ink">
                    {formatDate(entry.employmentRecord.startDate)} —{" "}
                    {entry.employmentRecord.isCurrent ? "present" : formatDate(entry.employmentRecord.endDate)}
                  </span>
                  {entry.contracts.length > 0 && (
                    <ul className="ml-3 list-disc">
                      {entry.contracts.map((contract) => (
                        <li key={contract.id}>
                          {contract.contractTypeLabel} — {formatDate(contract.startDate)} to{" "}
                          {contract.isActive ? "present" : formatDate(contract.endDate)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>

        <PanelGroup title="Work">
          {history.work.items.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No Work found.</p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {history.work.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <Link href={`/work/${item.id}`} className="min-w-0 truncate text-[13px] font-semibold text-yz-ink hover:underline">
                    {item.title}
                  </Link>
                  <span className="shrink-0 text-[11.5px] text-yz-neutral-500">{item.status}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-[12px] text-yz-neutral-600">
            {history.work.reports.length} report(s) authored · {history.work.evidence.length} piece(s) of evidence recorded.
          </p>
        </PanelGroup>

        <PanelGroup title="Projects">
          {history.projects.memberships.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No Project participation.</p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {history.projects.memberships.map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <Link
                    href={`/projects/${organisationId}/${project.id}`}
                    className="min-w-0 truncate text-[13px] font-semibold text-yz-ink hover:underline"
                  >
                    {project.name}
                  </Link>
                  <span className="shrink-0 text-[11.5px] text-yz-neutral-500">{project.status}</span>
                </li>
              ))}
            </ul>
          )}

          {history.projects.outcomesOwned.length > 0 && (
            <p className="mt-2 text-[12px] text-yz-neutral-600">
              Owns {history.projects.outcomesOwned.length} outcome(s):{" "}
              {history.projects.outcomesOwned.map((o) => o.title).join(", ")}
            </p>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
