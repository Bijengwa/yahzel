"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchParticipation, type Participation } from "@/lib/organisation";
import { OrganisationCard } from "../organisation/organisation-card";

/**
 * The person's organisation history, on their own profile.
 *
 * It reads the same membership data the Organisation area does — there is no
 * second copy of a person's history anywhere in Yahzel — and shows what is
 * running now above what has concluded.
 */
export function OrganisationsPanel() {
  const [participation, setParticipation] = useState<Participation[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { participation: next } = await fetchParticipation();

      setParticipation(next);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const current =
    participation?.filter((entry) => entry.membership.status !== "concluded") ??
    [];

  const past =
    participation?.filter((entry) => entry.membership.status === "concluded") ??
    [];

  return (
    <div className="rounded-md border border-yz-neutral-200 bg-yz-panel px-5">
      <PanelGroup
        title="Organisations"
        trailing={
          <Link
            href="/organisation"
            className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
          >
            Manage
          </Link>
        }
      >
        {error && <StatusMessage tone="error">{error}</StatusMessage>}

        {participation === null && !error ? (
          <p className="text-[13px] text-yz-neutral-600">Loading…</p>
        ) : current.length === 0 ? (
          <p className="text-[13px] leading-6 text-yz-neutral-600">
            You do not take part in any organisation yet.
          </p>
        ) : (
          <ul className="divide-y divide-yz-neutral-200">
            {current.map((entry) => (
              <li key={entry.membership.id}>
                <OrganisationCard
                  entry={entry}
                  href={`/organisation/${entry.organisation.id}`}
                />
              </li>
            ))}
          </ul>
        )}
      </PanelGroup>

      {past.length > 0 && (
        <PanelGroup title="Previously">
          <ul className="divide-y divide-yz-neutral-200">
            {past.map((entry) => (
              <li key={entry.membership.id}>
                <OrganisationCard entry={entry} />
              </li>
            ))}
          </ul>
        </PanelGroup>
      )}
    </div>
  );
}
