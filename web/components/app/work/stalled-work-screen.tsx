"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import { fetchOrganisationPeople, type Member } from "@/lib/organisation";
import { fetchStalled, scanStalled, type StalledDiagnostic } from "@/lib/work";
import {
  AdminOrganisationSelect,
  useAdminOrganisationPicker,
} from "./admin-organisation-picker";

type Status = { tone: "ok" | "error"; message: string } | null;

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

const KIND_LABELS: Record<StalledDiagnostic["kind"], string> = {
  stalled_blocked: "Blocked, no activity",
  overdue: "Overdue",
  stalled_inactive: "No activity",
};

function memberName(members: Member[], profileId: number): string {
  const member = members.find((entry) => entry.profileId === profileId);

  return member?.fullName ?? member?.email ?? `Member #${profileId}`;
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }

  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * A diagnostic view of Work that has stopped moving — never a rating of the
 * person it's assigned to. Every row states a fact ("no recorded activity
 * for N days") and a suggested next action; nothing here scores, ranks or
 * compares people.
 */
export function StalledWorkScreen() {
  const { organisations, organisationId, setOrganisationId } =
    useAdminOrganisationPicker();

  const [stalled, setStalled] = useState<StalledDiagnostic[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!organisationId) {
      return;
    }

    try {
      const [{ stalled: rows }, { members: mem }] = await Promise.all([
        fetchStalled(organisationId),
        fetchOrganisationPeople(organisationId),
      ]);

      setStalled(rows);
      setMembers(mem);
      setError(null);
    } catch (caught) {
      setError(failureMessage(caught));
    }
  }, [organisationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function scanNow() {
    if (!organisationId) {
      return;
    }

    setBusy(true);
    setStatus(null);

    try {
      const { message } = await scanStalled(organisationId);
      setStatus({ tone: "ok", message });
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Stalled work"
        description="Open work with no recent activity, blocked past the threshold, or overdue."
        actions={
          <AdminOrganisationSelect
            organisations={organisations ?? []}
            organisationId={organisationId}
            onChange={setOrganisationId}
          />
        }
      />

      {organisations !== null && organisations.length === 0 && (
        <StatusMessage tone="error">
          You need to administer an organisation to see its stalled work.
        </StatusMessage>
      )}

      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {status && <StatusMessage tone={status.tone}>{status.message}</StatusMessage>}

      {organisationId !== null && (
        <Panel>
          <PanelGroup
            title="Flagged work"
            trailing={
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void scanNow()}>
                {busy ? "Scanning…" : "Scan now"}
              </Button>
            }
          >
            {stalled === null ? (
              <p className="text-[13px] text-yz-neutral-600">Loading…</p>
            ) : stalled.length === 0 ? (
              <p className="text-[13px] leading-6 text-yz-neutral-600">
                Nothing is stalled, blocked or overdue right now.
              </p>
            ) : (
              <ul className="divide-y divide-yz-neutral-200">
                {stalled.map((entry) => (
                  <li key={entry.workItem.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <span className="min-w-0">
                        <Link
                          href={`/work/${entry.workItem.id}`}
                          className="block truncate text-[13px] font-semibold text-yz-ink underline-offset-4 hover:underline"
                        >
                          {entry.workItem.title}
                        </Link>

                        <span className="mt-0.5 block text-[12px] text-yz-neutral-600">
                          {memberName(members, entry.accountableProfileId)} · age{" "}
                          {entry.ageDays}d · last activity {formatDate(entry.lastActivityAt)}
                          {entry.dueAt ? ` · due ${formatDate(entry.dueAt)}` : ""}
                        </span>
                      </span>

                      <StatusPill tone={entry.kind === "overdue" ? "danger" : "warn"}>
                        {KIND_LABELS[entry.kind]}
                      </StatusPill>
                    </div>

                    <p className="mt-1.5 text-[12.5px] leading-5 text-yz-neutral-700">
                      {entry.message}
                    </p>

                    <p className="mt-0.5 text-[12px] leading-5 text-yz-neutral-500">
                      Suggested next action: {entry.suggestedNextAction}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </PanelGroup>
        </Panel>
      )}
    </div>
  );
}
