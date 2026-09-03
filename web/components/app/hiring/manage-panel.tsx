"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import { fetchHierarchy, type Position } from "@/lib/hierarchy";
import {
  applicationStatusLabel,
  createJobPosting,
  fetchAdminPostings,
  fetchPostingApplications,
  updatePostingStatus,
  type JobApplication,
  type JobPosting,
  type PostingStatus,
} from "@/lib/hiring";
import { ApplicationDetail } from "./application-detail";

type Status = { tone: "ok" | "error"; message: string } | null;

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

function postingStatusTone(status: PostingStatus): "ok" | "warn" | "muted" {
  if (status === "open") return "ok";
  if (status === "draft") return "warn";
  return "muted";
}

export function ManagePanel({ organisationId }: { organisationId: number }) {
  const [postings, setPostings] = useState<JobPosting[] | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", positionId: "" });

  const [selectedPostingId, setSelectedPostingId] = useState<number | null>(null);
  const [applications, setApplications] = useState<JobApplication[] | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<number | null>(null);

  const loadPostings = useCallback(async () => {
    try {
      const [{ postings: rows }, { positions: positionRows }] = await Promise.all([
        fetchAdminPostings(organisationId),
        fetchHierarchy(organisationId),
      ]);
      setPostings(rows);
      setPositions(positionRows);
      setError(null);
    } catch (caught) {
      setError(failureMessage(caught));
    }
  }, [organisationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPostings();
    setSelectedPostingId(null);
    setSelectedApplicationId(null);
  }, [loadPostings]);

  const loadApplications = useCallback(async (postingId: number) => {
    try {
      const { applications: rows } = await fetchPostingApplications(organisationId, postingId);
      setApplications(rows);
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    }
  }, [organisationId]);

  useEffect(() => {
    if (selectedPostingId !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadApplications(selectedPostingId);
    } else {
      setApplications(null);
    }
    setSelectedApplicationId(null);
  }, [selectedPostingId, loadApplications]);

  const createPosting = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    setStatus(null);

    try {
      await createJobPosting(organisationId, {
        title: form.title,
        description: form.description || null,
        positionId: form.positionId ? Number(form.positionId) : null,
      });
      setForm({ title: "", description: "", positionId: "" });
      setShowCreate(false);
      await loadPostings();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (postingId: number, next: PostingStatus) => {
    setBusy(true);
    setStatus(null);

    try {
      await updatePostingStatus(organisationId, postingId, next);
      await loadPostings();
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
    return <p className="text-[13px] text-yz-neutral-600">Loading…</p>;
  }

  const selectedPosting = postings.find((p) => p.id === selectedPostingId) ?? null;

  return (
    <div className="space-y-3">
      {status && <StatusMessage tone={status.tone}>{status.message}</StatusMessage>}

      <Panel>
        <PanelGroup
          title="Job postings"
          trailing={
            <Button size="sm" variant="secondary" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Cancel" : "New posting"}
            </Button>
          }
        >
          {showCreate && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void createPosting();
              }}
              className="mb-3 space-y-2.5 border-b border-yz-neutral-200 pb-3"
            >
              <TextField
                id="postingTitle"
                label="Title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <TextAreaField
                id="postingDescription"
                label="Description"
                hint="Optional."
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={busy || !form.title.trim()}>
                  Create as draft
                </Button>
              </div>
            </form>
          )}

          {postings.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-500">No job postings yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {postings.map((posting) => (
                <li
                  key={posting.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-sm border px-3 py-2 ${
                    selectedPostingId === posting.id ? "border-yz-ink" : "border-yz-neutral-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedPostingId(posting.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="text-[13px] font-semibold text-yz-ink">{posting.title}</span>
                  </button>

                  <StatusPill tone={postingStatusTone(posting.status)}>{posting.status}</StatusPill>

                  <div className="flex gap-1.5">
                    {posting.status === "draft" && (
                      <Button size="sm" variant="secondary" onClick={() => void changeStatus(posting.id, "open")} disabled={busy}>
                        Open
                      </Button>
                    )}
                    {posting.status === "open" && (
                      <Button size="sm" variant="secondary" onClick={() => void changeStatus(posting.id, "closed")} disabled={busy}>
                        Close
                      </Button>
                    )}
                    {posting.status === "closed" && (
                      <Button size="sm" variant="secondary" onClick={() => void changeStatus(posting.id, "open")} disabled={busy}>
                        Reopen
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>

      {selectedPosting && (
        <Panel>
          <PanelGroup title={`Applications for "${selectedPosting.title}"`}>
            {applications === null ? (
              <p className="text-[13px] text-yz-neutral-600">Loading…</p>
            ) : applications.length === 0 ? (
              <p className="text-[13px] text-yz-neutral-500">No applications yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {applications.map((application) => (
                  <li key={application.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedApplicationId(application.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left ${
                        selectedApplicationId === application.id ? "border-yz-ink" : "border-yz-neutral-200"
                      }`}
                    >
                      <span className="text-[13px] font-semibold text-yz-ink">
                        Applicant #{application.applicantProfileId}
                      </span>
                      <StatusPill tone="muted">{applicationStatusLabel(application.status)}</StatusPill>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PanelGroup>
        </Panel>
      )}

      {selectedApplicationId && (
        <ApplicationDetail
          organisationId={organisationId}
          applicationId={selectedApplicationId}
          viewerRole="admin"
          positions={positions}
          onChanged={() => {
            void loadPostings();
            if (selectedPostingId !== null) void loadApplications(selectedPostingId);
          }}
        />
      )}
    </div>
  );
}
