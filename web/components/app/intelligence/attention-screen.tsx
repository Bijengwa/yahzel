"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import {
  fetchAttention,
  resolveAttentionItem,
  runAttentionScan,
  signalTypeLabel,
  type AttentionItem,
} from "@/lib/intelligence";
import { OrganisationTabs } from "../organisation/organisation-tabs";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";
}

function relativeDetected(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Operational conditions that currently need a look — never a performance
 * dashboard. Each row names the record, why it is here, and when it was
 * first detected; resolving one is a deliberate acknowledgement, not a fix
 * applied on the record itself (fix the record on its own screen; come back
 * here and mark it resolved, or let the next scan clear it automatically
 * once the condition is no longer true).
 */
export function AttentionScreen({ organisationId }: { organisationId: number }) {
  const [items, setItems] = useState<AttentionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchAttention(organisationId);
      setItems(result.attention);
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

  async function rescan() {
    setScanning(true);
    setStatus(null);

    try {
      const result = await runAttentionScan(organisationId);
      setItems(result.attention);
      setStatus(result.message);
    } catch (caught) {
      setError(failureMessage(caught));
    } finally {
      setScanning(false);
    }
  }

  async function resolve(item: AttentionItem) {
    setBusyId(item.id);

    try {
      await resolveAttentionItem(organisationId, item.id);
      setItems((current) => current?.filter((entry) => entry.id !== item.id) ?? current);
    } catch (caught) {
      setError(failureMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  if (forbidden) {
    return (
      <div className="space-y-3">
        <PageHeader title="Attention" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">Only an administrator can view this organisation&apos;s attention items.</StatusMessage>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Attention"
        description="Operational conditions detected from Work, Projects, Outcomes and Contracts."
        actions={
          <Button size="sm" variant="secondary" disabled={scanning} onClick={() => void rescan()}>
            {scanning ? "Scanning…" : "Rescan"}
          </Button>
        }
      />

      <OrganisationTabs organisationId={organisationId} />

      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {status && <StatusMessage tone="ok">{status}</StatusMessage>}

      <Panel>
        <PanelGroup title={items ? `${items.length} active` : "Attention"}>
          {items === null ? (
            <p className="text-[13px] text-yz-neutral-600">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">Nothing needs attention right now.</p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      {item.severity === "high" && (
                        <span className="rounded-sm border border-yz-danger-line bg-yz-danger-bg px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-yz-danger-ink">
                          High
                        </span>
                      )}
                      <span className="text-[11.5px] font-bold uppercase tracking-wide text-yz-neutral-500">
                        {signalTypeLabel(item.type)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-yz-ink">{item.message}</span>
                    <span className="mt-0.5 block text-[11.5px] text-yz-neutral-500">
                      Detected {relativeDetected(item.detectedAt)}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {item.actionUrl && (
                      <Link
                        href={item.actionUrl}
                        className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
                      >
                        View
                      </Link>
                    )}

                    <Button size="sm" variant="ghost" disabled={busyId === item.id} onClick={() => void resolve(item)}>
                      {busyId === item.id ? "Resolving…" : "Resolve"}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
