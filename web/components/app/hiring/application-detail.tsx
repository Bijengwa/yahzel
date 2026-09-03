"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import {
  acceptOffer,
  applicationStatusLabel,
  createOffer,
  declineOffer,
  fetchApplication,
  offerStatusLabel,
  reviewApplication,
  scheduleInterview,
  updateInterview,
  withdrawApplication,
  withdrawOffer,
  type ApplicationStatus,
  type JobApplication,
  type JobInterview,
  type JobOffer,
} from "@/lib/hiring";
import { loadOrganisationVocabulary, type OrganisationTypeOption } from "@/lib/organisation";
import type { Position } from "@/lib/hierarchy";

type Status = { tone: "ok" | "error"; message: string } | null;

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

function statusTone(status: ApplicationStatus): "ok" | "warn" | "danger" | "muted" {
  if (status === "hired") return "ok";
  if (status === "rejected" || status === "withdrawn") return "muted";
  if (status === "offered") return "warn";
  return "muted";
}

const TERMINAL = new Set(["hired", "rejected", "withdrawn"]);

export function ApplicationDetail({
  organisationId,
  applicationId,
  viewerRole,
  positions,
  onChanged,
}: {
  organisationId: number;
  applicationId: number;
  /** "admin" sees review/interview/offer controls; "candidate" sees withdraw/accept/decline. */
  viewerRole: "admin" | "candidate";
  /** Only needed for admin — used to let an offer target a position. */
  positions?: Position[];
  onChanged?: () => void;
}) {
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [interviews, setInterviews] = useState<JobInterview[]>([]);
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [vocabulary, setVocabulary] = useState<{
    participationTypes: OrganisationTypeOption[];
    organisationClasses: OrganisationTypeOption[];
    designations: OrganisationTypeOption[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const [interviewForm, setInterviewForm] = useState({ scheduledAt: "", notes: "" });
  const [showInterviewForm, setShowInterviewForm] = useState(false);

  const [offerForm, setOfferForm] = useState({
    positionId: "",
    title: "",
    participationType: "employee",
    organisationClass: "member",
    designation: "member",
    expectedStartAt: "",
  });
  const [showOfferForm, setShowOfferForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await fetchApplication(organisationId, applicationId);
      setApplication(result.application);
      setInterviews(result.interviews);
      setOffers(result.offers);
      setError(null);
    } catch (caught) {
      setError(failureMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [organisationId, applicationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (viewerRole !== "admin") return;

    loadOrganisationVocabulary()
      .then((v) =>
        setVocabulary({
          participationTypes: v.participationTypes,
          organisationClasses: v.organisationClasses,
          designations: v.designations,
        }),
      )
      .catch(() => setVocabulary(null));
  }, [viewerRole]);

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const run = async (action: () => Promise<unknown>, okMessage: string) => {
    setBusy(true);
    setStatus(null);

    try {
      await action();
      setStatus({ tone: "ok", message: okMessage });
      await refresh();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-[13px] text-yz-neutral-600">Loading application…</p>;
  }

  if (error || !application) {
    return <StatusMessage tone="error">{error ?? "Application not found."}</StatusMessage>;
  }

  const openOffer = offers.find((o) => o.status === "pending");
  const canAct = !TERMINAL.has(application.status);

  return (
    <div className="space-y-3">
      {status && <StatusMessage tone={status.tone}>{status.message}</StatusMessage>}

      <Panel>
        <PanelGroup
          title="Application"
          trailing={
            <StatusPill tone={statusTone(application.status)}>
              {applicationStatusLabel(application.status)}
            </StatusPill>
          }
        >
          {application.coverNote && (
            <p className="text-[13px] leading-6 text-yz-neutral-700">{application.coverNote}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {viewerRole === "admin" && canAct && application.status === "submitted" && (
              <Button
                size="sm"
                onClick={() => void run(() => reviewApplication(organisationId, applicationId, "under_review"), "Moved to under review.")}
                disabled={busy}
              >
                Start review
              </Button>
            )}

            {viewerRole === "admin" && canAct && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => void run(() => reviewApplication(organisationId, applicationId, "rejected"), "Application rejected.")}
                disabled={busy}
              >
                Reject
              </Button>
            )}

            {viewerRole === "candidate" && canAct && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => void run(() => withdrawApplication(applicationId), "Application withdrawn.")}
                disabled={busy}
              >
                Withdraw application
              </Button>
            )}
          </div>
        </PanelGroup>

        <PanelGroup
          title="Interviews"
          trailing={
            viewerRole === "admin" && canAct && application.status !== "offered" ? (
              <Button size="sm" variant="secondary" onClick={() => setShowInterviewForm((v) => !v)}>
                {showInterviewForm ? "Cancel" : "Schedule interview"}
              </Button>
            ) : undefined
          }
        >
          {interviews.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-500">No interviews scheduled yet.</p>
          ) : (
            <ul className="space-y-2">
              {interviews.map((interview) => (
                <li key={interview.id} className="flex items-start justify-between gap-3 border-b border-yz-neutral-200 pb-2 last:border-b-0">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-yz-ink">
                      {interview.scheduledAt ? new Date(interview.scheduledAt).toLocaleString() : "No time set"}
                    </p>
                    {interview.notes && <p className="text-[12.5px] text-yz-neutral-700">{interview.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill
                      tone={interview.outcome === "passed" ? "ok" : interview.outcome === "failed" ? "danger" : "muted"}
                    >
                      {interview.outcome}
                    </StatusPill>
                    {viewerRole === "admin" && interview.outcome === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void run(
                              () => updateInterview(organisationId, interview.id, { outcome: "passed" }),
                              "Interview marked passed.",
                            )
                          }
                          disabled={busy}
                        >
                          Passed
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void run(
                              () => updateInterview(organisationId, interview.id, { outcome: "failed" }),
                              "Interview marked failed.",
                            )
                          }
                          disabled={busy}
                        >
                          Failed
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {showInterviewForm && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () =>
                    scheduleInterview(organisationId, applicationId, {
                      scheduledAt: interviewForm.scheduledAt || null,
                      notes: interviewForm.notes || null,
                    }),
                  "Interview scheduled.",
                ).then(() => {
                  setShowInterviewForm(false);
                  setInterviewForm({ scheduledAt: "", notes: "" });
                });
              }}
              className="mt-3 space-y-2.5 border-t border-yz-neutral-200 pt-3"
            >
              <TextField
                id="interviewScheduledAt"
                label="Scheduled for"
                type="datetime-local"
                hint="Optional."
                value={interviewForm.scheduledAt}
                onChange={(event) => setInterviewForm({ ...interviewForm, scheduledAt: event.target.value })}
              />
              <TextAreaField
                id="interviewNotes"
                label="Notes"
                hint="Optional."
                value={interviewForm.notes}
                onChange={(event) => setInterviewForm({ ...interviewForm, notes: event.target.value })}
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={busy}>
                  Schedule
                </Button>
              </div>
            </form>
          )}
        </PanelGroup>

        <PanelGroup
          title="Offer"
          trailing={
            viewerRole === "admin" && canAct && !openOffer ? (
              <Button size="sm" variant="secondary" onClick={() => setShowOfferForm((v) => !v)}>
                {showOfferForm ? "Cancel" : "Extend offer"}
              </Button>
            ) : undefined
          }
        >
          {offers.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-500">No offer has been made yet.</p>
          ) : (
            <ul className="space-y-2">
              {offers.map((offer) => (
                <li key={offer.id} className="border-b border-yz-neutral-200 pb-2 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-yz-ink">
                      {offer.title ?? offer.designation}
                    </p>
                    <StatusPill tone={offer.status === "accepted" ? "ok" : offer.status === "pending" ? "warn" : "muted"}>
                      {offerStatusLabel(offer.status)}
                    </StatusPill>
                  </div>
                  <p className="text-[12px] text-yz-neutral-500">
                    {offer.participationType} · {offer.organisationClass}
                    {offer.expectedStartAt ? ` · starts ${new Date(offer.expectedStartAt).toLocaleDateString()}` : ""}
                  </p>

                  {offer.status === "pending" && viewerRole === "admin" && (
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void run(() => withdrawOffer(organisationId, offer.id), "Offer withdrawn.")}
                        disabled={busy}
                      >
                        Withdraw offer
                      </Button>
                    </div>
                  )}

                  {offer.status === "pending" && viewerRole === "candidate" && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void run(() => acceptOffer(offer.id), "Offer accepted — welcome to the team.")}
                        disabled={busy}
                      >
                        Accept offer
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void run(() => declineOffer(offer.id), "Offer declined.")}
                        disabled={busy}
                      >
                        Decline
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {showOfferForm && vocabulary && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () =>
                    createOffer(organisationId, applicationId, {
                      positionId: offerForm.positionId ? Number(offerForm.positionId) : null,
                      title: offerForm.title || null,
                      participationType: offerForm.participationType,
                      organisationClass: offerForm.organisationClass,
                      designation: offerForm.designation,
                      expectedStartAt: offerForm.expectedStartAt || null,
                    }),
                  "Offer extended.",
                ).then(() => setShowOfferForm(false));
              }}
              className="mt-3 space-y-2.5 border-t border-yz-neutral-200 pt-3"
            >
              <div className="grid gap-2.5 sm:grid-cols-2">
                <TextField
                  id="offerTitle"
                  label="Proposed title"
                  hint="Optional, e.g. Backend Engineer."
                  value={offerForm.title}
                  onChange={(event) => setOfferForm({ ...offerForm, title: event.target.value })}
                />
                {positions && positions.length > 0 && (
                  <SelectField
                    id="offerPosition"
                    label="Position"
                    hint="Optional."
                    value={offerForm.positionId}
                    onChange={(event) => setOfferForm({ ...offerForm, positionId: event.target.value })}
                  >
                    <option value="">No position</option>
                    {positions.map((position) => (
                      <option key={position.id} value={position.id}>
                        {position.name}
                      </option>
                    ))}
                  </SelectField>
                )}
                <SelectField
                  id="offerParticipationType"
                  label="Participation type"
                  value={offerForm.participationType}
                  onChange={(event) => setOfferForm({ ...offerForm, participationType: event.target.value })}
                >
                  {vocabulary.participationTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="offerOrganisationClass"
                  label="Organisation class"
                  value={offerForm.organisationClass}
                  onChange={(event) => setOfferForm({ ...offerForm, organisationClass: event.target.value })}
                >
                  {vocabulary.organisationClasses.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="offerDesignation"
                  label="Designation"
                  value={offerForm.designation}
                  onChange={(event) => setOfferForm({ ...offerForm, designation: event.target.value })}
                >
                  {vocabulary.designations.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  id="offerExpectedStart"
                  label="Expected start"
                  type="date"
                  hint="Optional."
                  value={offerForm.expectedStartAt}
                  onChange={(event) => setOfferForm({ ...offerForm, expectedStartAt: event.target.value })}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={busy}>
                  Extend offer
                </Button>
              </div>
            </form>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
