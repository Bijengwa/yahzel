"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/ui/panel";
import { fetchParticipation, type Participation } from "@/lib/organisation";
import { ManagePanel } from "./manage-panel";
import { MyApplicationsPanel } from "./my-applications-panel";
import { OpenPositionsPanel } from "./open-positions-panel";

const TABS = [
  { value: "mine", label: "My Applications" },
  { value: "open", label: "Open Positions" },
  { value: "manage", label: "Manage" },
] as const;

type Tab = (typeof TABS)[number]["value"];

export function HiringScreen() {
  const [organisations, setOrganisations] = useState<Participation[] | null>(null);
  const [organisationId, setOrganisationId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("mine");

  useEffect(() => {
    let cancelled = false;

    fetchParticipation()
      .then(({ participation }) => {
        if (cancelled) return;

        const active = participation.filter((entry) => entry.membership.status === "active");
        setOrganisations(active);
        setOrganisationId((current) => current ?? active[0]?.organisation.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setOrganisations([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selected = organisations?.find((entry) => entry.organisation.id === organisationId) ?? null;
  const isAdmin = selected?.membership.isAdmin ?? false;
  const visibleTabs = TABS.filter((t) => t.value !== "manage" || isAdmin);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Hiring"
        description="Job Posting → Application → Review → Interview → Offer → Accept → Member."
        actions={
          organisations && organisations.length > 1 ? (
            <select
              value={organisationId ?? ""}
              onChange={(event) => setOrganisationId(Number(event.target.value))}
              className="h-8 rounded-sm border border-yz-neutral-300 bg-yz-panel px-2.5 text-[12.5px] text-yz-ink outline-none transition-colors duration-150 focus:border-yz-ink"
            >
              {organisations.map((entry) => (
                <option key={entry.organisation.id} value={entry.organisation.id}>
                  {entry.organisation.name}
                </option>
              ))}
            </select>
          ) : selected ? (
            <span className="text-[12.5px] font-semibold text-yz-neutral-700">
              {selected.organisation.name}
            </span>
          ) : undefined
        }
      />

      <div
        role="tablist"
        aria-label="Hiring sections"
        className="flex items-center gap-1 border-b border-yz-neutral-200"
      >
        {visibleTabs.map((option) => {
          const active = tab === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(option.value)}
              className={`-mb-px border-b-2 px-2.5 py-2 text-[13px] font-semibold transition-colors duration-150 ${
                active
                  ? "border-yz-accent text-yz-ink"
                  : "border-transparent text-yz-neutral-600 hover:text-yz-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {tab === "mine" && <MyApplicationsPanel />}

      {tab === "open" &&
        (organisationId ? (
          <OpenPositionsPanel organisationId={organisationId} />
        ) : (
          <p className="text-[13px] text-yz-neutral-600">
            {organisations === null ? "Loading…" : "Join an organisation to see what it's hiring for."}
          </p>
        ))}

      {tab === "manage" && organisationId && isAdmin && <ManagePanel organisationId={organisationId} />}
    </div>
  );
}
