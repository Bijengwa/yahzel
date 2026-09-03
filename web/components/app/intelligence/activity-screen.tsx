"use client";

import { useCallback, useEffect, useState } from "react";

import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchActivity, type ActivityEntry } from "@/lib/intelligence";
import { OrganisationTabs } from "../organisation/organisation-tabs";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** What has been happening in this organisation — real business events, not a raw database log. */
export function ActivityScreen({ organisationId }: { organisationId: number }) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchActivity(organisationId);
      setEntries(result.activity);
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
        <PageHeader title="Activity" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">Only an administrator can view this organisation&apos;s activity.</StatusMessage>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Activity" description="What has been happening in this organisation." />
      <OrganisationTabs organisationId={organisationId} />

      {error && <StatusMessage tone="error">{error}</StatusMessage>}

      <Panel>
        <PanelGroup title="Recent activity">
          {entries === null ? (
            <p className="text-[13px] text-yz-neutral-600">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {entries.map((entry) => (
                <li key={entry.id} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="text-[13px] text-yz-ink">{entry.message}</p>
                  <p className="mt-0.5 text-[11.5px] text-yz-neutral-500">{formatWhen(entry.occurredAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
