"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { fetchParticipation, type Participation } from "@/lib/organisation";

/**
 * The doorway into hierarchy management, shown on /work for anyone who
 * administers at least one active organisation. Nothing here decides who
 * may edit a hierarchy — the destination page and its API re-check that
 * independently. This is purely "which organisation, if more than one."
 *
 * Renders nothing for a person who administers no organisation, so it never
 * adds clutter to the common case.
 */
export function HierarchyEntry() {
  const [adminOrgs, setAdminOrgs] = useState<Participation[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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

        setAdminOrgs(admins);

        // A single administered organisation is not ambiguous — the choice
        // is made for them. More than one must be picked explicitly; never
        // guess which one they mean.
        setSelectedId(
          admins.length === 1 ? (admins[0]?.organisation.id ?? null) : null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setAdminOrgs([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!adminOrgs || adminOrgs.length === 0) {
    return null;
  }

  const single = adminOrgs.length === 1 ? adminOrgs[0] : null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-yz-neutral-200 bg-yz-panel px-3.5 py-2.5">
      {single ? (
        <span className="text-[12.5px] font-semibold text-yz-neutral-700">
          Organisation: {single.organisation.name}
        </span>
      ) : (
        <>
          <label htmlFor="hierarchyOrgSelect" className="sr-only">
            Choose an organisation
          </label>
          <select
            id="hierarchyOrgSelect"
            value={selectedId ?? ""}
            onChange={(event) =>
              setSelectedId(
                event.target.value ? Number(event.target.value) : null,
              )
            }
            className="h-8 rounded-sm border border-yz-neutral-300 bg-yz-panel px-2.5 text-[12.5px] text-yz-ink outline-none transition-colors duration-150 focus:border-yz-ink"
          >
            <option value="">Choose an organisation</option>

            {adminOrgs.map((entry) => (
              <option key={entry.organisation.id} value={entry.organisation.id}>
                {entry.organisation.name}
              </option>
            ))}
          </select>
        </>
      )}

      {selectedId !== null ? (
        <Link href={`/organisation/${selectedId}/hierarchy`}>
          <Button type="button" variant="secondary" size="sm">
            Set hierarchy
          </Button>
        </Link>
      ) : (
        <Button type="button" variant="secondary" size="sm" disabled>
          Set hierarchy
        </Button>
      )}
    </div>
  );
}
