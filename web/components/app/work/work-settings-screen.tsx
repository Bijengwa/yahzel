"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { PageHeader, Panel, PanelGroup, PanelRow, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchWorkSettings, updateWorkSettings, type WorkSettings } from "@/lib/work";
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

/**
 * The three thresholds Phase 4's diagnostics run on. Nothing here changes
 * what stalled/overdue/expiring mean — only how many days an organisation
 * wants before something is flagged.
 */
export function WorkSettingsScreen() {
  const { organisations, organisationId, setOrganisationId } =
    useAdminOrganisationPicker();

  const [settings, setSettings] = useState<WorkSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  const [contractNoticeDays, setContractNoticeDays] = useState("30");
  const [stalledInactiveDays, setStalledInactiveDays] = useState("14");
  const [stalledBlockedDays, setStalledBlockedDays] = useState("7");

  const load = useCallback(async () => {
    if (!organisationId) {
      return;
    }

    try {
      const { settings: current } = await fetchWorkSettings(organisationId);

      setSettings(current);
      setContractNoticeDays(String(current.contractNoticeDays));
      setStalledInactiveDays(String(current.stalledInactiveDays));
      setStalledBlockedDays(String(current.stalledBlockedDays));
      setError(null);
    } catch (caught) {
      setError(failureMessage(caught));
    }
  }, [organisationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save() {
    if (!organisationId) {
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const { message, settings: updated } = await updateWorkSettings(organisationId, {
        contractNoticeDays: Number(contractNoticeDays),
        stalledInactiveDays: Number(stalledInactiveDays),
        stalledBlockedDays: Number(stalledBlockedDays),
      });

      setSettings(updated);
      setStatus({ tone: "ok", message });
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Work settings"
        description="Thresholds for contract-expiry notices and stalled-work detection."
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
          You need to administer an organisation to change its settings.
        </StatusMessage>
      )}

      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {status && <StatusMessage tone={status.tone}>{status.message}</StatusMessage>}

      {organisationId !== null && (
        <Panel>
          <PanelGroup title="Thresholds">
            {settings === null && !error ? (
              <p className="text-[13px] text-yz-neutral-600">Loading…</p>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <PanelRow
                  label="Contract notice window"
                  description="How many days before a contract's end date it becomes an obligation to review."
                >
                  <TextField
                    id="contractNoticeDays"
                    label="Days"
                    type="number"
                    min={1}
                    max={365}
                    className="max-w-[8rem]"
                    value={contractNoticeDays}
                    onChange={(event) => setContractNoticeDays(event.target.value)}
                  />
                </PanelRow>

                <div className="mt-4">
                  <PanelRow
                    label="Stalled — no activity"
                    description="Days of no recorded activity on open work before it is flagged."
                  >
                    <TextField
                      id="stalledInactiveDays"
                      label="Days"
                      type="number"
                      min={1}
                      max={365}
                      className="max-w-[8rem]"
                      value={stalledInactiveDays}
                      onChange={(event) => setStalledInactiveDays(event.target.value)}
                    />
                  </PanelRow>
                </div>

                <div className="mt-4">
                  <PanelRow
                    label="Stalled — blocked"
                    description="Days blocked with no recorded activity before it is flagged."
                  >
                    <TextField
                      id="stalledBlockedDays"
                      label="Days"
                      type="number"
                      min={1}
                      max={365}
                      className="max-w-[8rem]"
                      value={stalledBlockedDays}
                      onChange={(event) => setStalledBlockedDays(event.target.value)}
                    />
                  </PanelRow>
                </div>

                <div className="mt-4">
                  <Button type="submit" variant="primary" size="sm" disabled={saving}>
                    {saving ? "Saving…" : "Save settings"}
                  </Button>
                </div>
              </form>
            )}
          </PanelGroup>
        </Panel>
      )}
    </div>
  );
}
