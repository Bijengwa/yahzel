"use client";

import { useEffect, useState } from "react";

import { fetchParticipation, type Participation } from "@/lib/organisation";

/**
 * The organisation a Projects screen is scoped to. Unlike
 * useAdminOrganisationPicker (Phase 4's admin-only screens), any active
 * membership qualifies — creating and viewing Projects is as open as
 * creating Work, see project.service.ts. A single organisation is chosen
 * automatically; more than one must be picked explicitly.
 */
export function useProjectOrganisation(initialId?: number | null) {
  const [organisations, setOrganisations] = useState<Participation[] | null>(null);
  const [organisationId, setOrganisationId] = useState<number | null>(
    initialId ?? null,
  );

  useEffect(() => {
    let cancelled = false;

    fetchParticipation()
      .then(({ participation }) => {
        if (cancelled) {
          return;
        }

        const active = participation.filter(
          (entry) => entry.membership.status === "active",
        );

        setOrganisations(active);

        setOrganisationId((current) => {
          if (current !== null) {
            return current;
          }

          return active.length === 1 ? (active[0]?.organisation.id ?? null) : null;
        });
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
