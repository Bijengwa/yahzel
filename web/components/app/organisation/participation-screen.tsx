"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  PageHeader,
  Panel,
  PanelGroup,
  PanelRow,
  StatusMessage,
} from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import {
  acceptInvitation,
  declineInvitation,
  describeStanding,
  fetchParticipation,
  type Participation,
} from "@/lib/organisation";
import { StandingPills } from "./standing-pills";

type Status = { tone: "ok" | "error"; message: string } | null;

/** "Company · Tanzania · 4 people" — the facts, in one quiet line. */
function summarise({ organisation }: Participation): string {
  return [
    organisation.typeLabel,
    organisation.countryName,
    `${organisation.memberCount} ${
      organisation.memberCount === 1 ? "person" : "people"
    }`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ParticipationScreen() {
  const [participation, setParticipation] = useState<Participation[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [answering, setAnswering] = useState<number | null>(null);

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
    // Synchronising with an external system — the Yahzel API. Nothing is set
    // before the first await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function answer(id: number, accept: boolean) {
    setAnswering(id);
    setStatus(null);

    try {
      const { message } = accept
        ? await acceptInvitation(id)
        : await declineInvitation(id);

      setStatus({ tone: "ok", message });
      await load();
    } catch (caught) {
      setStatus({
        tone: "error",
        message:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Please try again.",
      });
    } finally {
      setAnswering(null);
    }
  }

  const invitations =
    participation?.filter((entry) => entry.membership.status === "invited") ??
    [];

  const active =
    participation?.filter((entry) => entry.membership.status === "active") ?? [];

  return (
    <div className="space-y-3">
      <PageHeader
        title="Organisation"
        description="The organisations you take part in, and the ones you run."
        actions={
          <Link
            href="/organisation/new"
            className="inline-flex items-center rounded-sm border border-yz-ink bg-yz-ink px-4 py-2 text-[13px] font-bold text-yz-ink-contrast transition-colors duration-150 hover:opacity-90"
          >
            Register organisation
          </Link>
        }
      />

      {status && <StatusMessage tone={status.tone}>{status.message}</StatusMessage>}

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
            <ul className="space-y-3">
              {invitations.map((entry) => (
                <li key={entry.organisation.id}>
                  <PanelRow
                    label={entry.organisation.name}
                    description={
                      <>
                        {summarise(entry)}
                        {entry.membership.title
                          ? ` · invited as ${entry.membership.title}`
                          : ""}
                      </>
                    }
                    trailing={
                      <span className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={answering === entry.organisation.id}
                          onClick={() =>
                            void answer(entry.organisation.id, false)
                          }
                        >
                          Decline
                        </Button>

                        <Button
                          size="sm"
                          variant="primary"
                          disabled={answering === entry.organisation.id}
                          onClick={() =>
                            void answer(entry.organisation.id, true)
                          }
                        >
                          {answering === entry.organisation.id
                            ? "Working…"
                            : "Accept"}
                        </Button>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          </PanelGroup>
        )}

        <PanelGroup title="My participation">
          {participation === null && !error ? (
            <p className="text-[13px] text-yz-neutral-600">Loading…</p>
          ) : active.length === 0 ? (
            <p className="text-[13px] leading-6 text-yz-neutral-600">
              You do not take part in any organisation yet. Register one, or
              wait to be invited to an existing one.
            </p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {active.map((entry) => (
                <li key={entry.organisation.id} className="first:pt-0 last:pb-0">
                  <Link
                    href={`/organisation/${entry.organisation.id}`}
                    className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-sm px-2 py-2.5 transition-colors duration-150 hover:bg-yz-neutral-100"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-yz-ink">
                        {entry.organisation.name}
                      </span>

                      <span className="mt-0.5 block truncate text-[12px] text-yz-neutral-600">
                        {summarise(entry)} · {describeStanding(entry.membership)}
                      </span>
                    </span>

                    <StandingPills membership={entry.membership} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
