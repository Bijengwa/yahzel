"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  PageHeader,
  Panel,
  PanelGroup,
  StatusMessage,
} from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import {
  fetchParticipation,
  type Invitation,
  type Participation,
} from "@/lib/organisation";
import { InvitationList } from "./invitation-list";
import { OrganisationCard } from "./organisation-card";

type Status = { tone: "ok" | "error"; message: string } | null;

export function ParticipationScreen() {
  const [participation, setParticipation] = useState<Participation[] | null>(
    null,
  );
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchParticipation();

      setParticipation(next.participation);
      setInvitations(next.invitations);
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
    // Synchronising with an external system — the Yahzel API. Nothing is set
    // before the first await.
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
    <div className="space-y-3">
      <PageHeader
        title="Organisation"
        description="The organisations you take part in, and the ones you run."
        actions={
          <Link
            href="/organisation/new"
            className="inline-flex items-center rounded-sm border border-yz-ink bg-yz-ink px-4 py-2 text-[13px] font-bold text-yz-ink-contrast transition-opacity duration-150 hover:opacity-90"
          >
            Register organisation
          </Link>
        }
      />

      {status && (
        <StatusMessage tone={status.tone}>{status.message}</StatusMessage>
      )}

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
        {invitations.length > 0 && (
          <PanelGroup title="Invitations">
            <InvitationList
              invitations={invitations}
              onAnswered={(message) => {
                setStatus({ tone: "ok", message });
                void load();
              }}
            />
          </PanelGroup>
        )}

        <PanelGroup title="My participation">
          {participation === null && !error ? (
            <p className="text-[13px] text-yz-neutral-600">Loading…</p>
          ) : current.length === 0 ? (
            <p className="text-[13px] leading-6 text-yz-neutral-600">
              You do not take part in any organisation yet. Register one, or
              wait to be invited to an existing one.
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
      </Panel>
    </div>
  );
}
