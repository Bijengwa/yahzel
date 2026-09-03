"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import {
  applicationStatusLabel,
  applyToPosting,
  fetchMyApplications,
  fetchOpenPostings,
  type JobApplication,
  type JobPosting,
} from "@/lib/hiring";

type Status = { tone: "ok" | "error"; message: string } | null;

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

export function OpenPositionsPanel({ organisationId }: { organisationId: number }) {
  const [postings, setPostings] = useState<JobPosting[] | null>(null);
  const [myApplications, setMyApplications] = useState<JobApplication[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const [applyingTo, setApplyingTo] = useState<number | null>(null);
  const [coverNote, setCoverNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [{ postings: rows }, { applications }] = await Promise.all([
        fetchOpenPostings(organisationId),
        fetchMyApplications(),
      ]);
      setPostings(rows);
      setMyApplications(applications);
      setError(null);
    } catch (caught) {
      setError(failureMessage(caught));
    }
  }, [organisationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const apply = async (postingId: number) => {
    setBusy(true);
    setStatus(null);

    try {
      await applyToPosting(organisationId, postingId, coverNote);
      setStatus({ tone: "ok", message: "Your application has been submitted." });
      setApplyingTo(null);
      setCoverNote("");
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return <StatusMessage tone="error">{error}</StatusMessage>;
  }

  if (postings === null) {
    return <p className="text-[13px] text-yz-neutral-600">Loading open positions…</p>;
  }

  return (
    <div className="space-y-3">
      {status && <StatusMessage tone={status.tone}>{status.message}</StatusMessage>}

      <Panel>
        <PanelGroup title="Open positions">
          {postings.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-500">Nothing is open for applications right now.</p>
          ) : (
            <ul className="space-y-3">
              {postings.map((posting) => {
                const existing = myApplications.find((a) => a.jobPostingId === posting.id);

                return (
                  <li key={posting.id} className="border-b border-yz-neutral-200 pb-3 last:border-b-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-[14px] font-bold text-yz-ink">{posting.title}</p>
                      {existing && (
                        <StatusPill tone="muted">{applicationStatusLabel(existing.status)}</StatusPill>
                      )}
                    </div>

                    {posting.description && (
                      <p className="mt-1 text-[12.5px] leading-6 text-yz-neutral-700">{posting.description}</p>
                    )}

                    {!existing && (
                      <div className="mt-2">
                        {applyingTo === posting.id ? (
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              void apply(posting.id);
                            }}
                            className="space-y-2"
                          >
                            <TextAreaField
                              id={`coverNote-${posting.id}`}
                              label="Cover note"
                              hint="Optional."
                              value={coverNote}
                              onChange={(event) => setCoverNote(event.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button type="submit" size="sm" disabled={busy}>
                                Submit application
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setApplyingTo(null)}
                                disabled={busy}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <Button size="sm" onClick={() => setApplyingTo(posting.id)}>
                            Apply
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
