"use client";

import { useEffect, useState } from "react";

import { fetchParticipation, type Participation } from "@/lib/organisation";

/**
 * The organisation an admin-only Phase 4 screen (Capabilities, Stalled
 * work, Work settings) is scoped to. Mirrors HierarchyEntry's own logic —
 * a single administered organisation is chosen automatically; more than
 * one must be picked explicitly.
 */
export function useAdminOrganisationPicker() {
  const [organisations, setOrganisations] = useState<Participation[] | null>(null);
  const [organisationId, setOrganisationId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchParticipation()
      .then(({ participation }) => {
        if (cancelled) {
          return;
        }

        const admins = participation.filter(
          (entry) =>
            entry.membership.isAdmin && entry.membership.status === "active",
        );

        setOrganisations(admins);
        setOrganisationId(
          admins.length === 1 ? (admins[0]?.organisation.id ?? null) : null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setOrganisations([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { organisations, organisationId, setOrganisationId };
}

export function AdminOrganisationSelect({
  organisations,
  organisationId,
  onChange,
}: {
  organisations: Participation[];
  organisationId: number | null;
  onChange: (id: number) => void;
}) {
  if (organisations.length === 0) {
    return null;
  }

  if (organisations.length === 1) {
    return (
      <span className="text-[12.5px] font-semibold text-yz-neutral-700">
        Organisation: {organisations[0]!.organisation.name}
      </span>
    );
  }

  return (
    <>
      <label htmlFor="adminOrgSelect" className="sr-only">
        Choose an organisation
      </label>
      <select
        id="adminOrgSelect"
        value={organisationId ?? ""}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 rounded-sm border border-yz-neutral-300 bg-yz-panel px-2.5 text-[12.5px] text-yz-ink outline-none transition-colors duration-150 focus:border-yz-ink"
      >
        <option value="">Choose an organisation</option>

        {organisations.map((entry) => (
          <option key={entry.organisation.id} value={entry.organisation.id}>
            {entry.organisation.name}
          </option>
        ))}
      </select>
    </>
  );
}
