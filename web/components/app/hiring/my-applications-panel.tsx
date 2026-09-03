"use client";

import { useCallback, useEffect, useState } from "react";

import { Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import { applicationStatusLabel, fetchMyApplications, type JobApplication } from "@/lib/hiring";
import { formatMonthYear } from "@/lib/format";
import { ApplicationDetail } from "./application-detail";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

export function MyApplicationsPanel() {
  const [applications, setApplications] = useState<JobApplication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ organisationId: number; applicationId: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const { applications: rows } = await fetchMyApplications();
      setApplications(rows);
      setError(null);
    } catch (caught) {
      setError(failureMessage(caught));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (error) {
    return <StatusMessage tone="error">{error}</StatusMessage>;
  }

  if (applications === null) {
    return <p className="text-[13px] text-yz-neutral-600">Loading your applications…</p>;
  }

  return (
    <div className="space-y-3">
      <Panel>
        <PanelGroup title="My applications">
          {applications.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-500">You haven&apos;t applied to anything yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {applications.map((application) => (
                <li key={application.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected({ organisationId: application.organisationId, applicationId: application.id })
                    }
                    className={`flex w-full items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left ${
                      selected?.applicationId === application.id ? "border-yz-ink" : "border-yz-neutral-200"
                    }`}
                  >
                    <span className="text-[13px] font-semibold text-yz-ink">
                      Application #{application.id}
                      <span className="ml-2 font-normal text-yz-neutral-500">
                        applied {formatMonthYear(application.createdAt)}
                      </span>
                    </span>
                    <StatusPill tone="muted">{applicationStatusLabel(application.status)}</StatusPill>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>

      {selected && (
        <ApplicationDetail
          organisationId={selected.organisationId}
          applicationId={selected.applicationId}
          viewerRole="candidate"
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
