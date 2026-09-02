"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import { fetchOrganisationPeople, type Member } from "@/lib/organisation";
import {
  CADENCES,
  createCapability,
  createSchedule,
  fetchCapabilities,
  fetchSchedules,
  generateSchedules,
  instantiateCapability,
  updateCapability,
  type Capability,
  type Schedule,
} from "@/lib/work";
import { useProfile } from "../profile/profile-provider";
import { AssigneeSelect } from "./assignee-select";
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

const CADENCE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

function memberName(members: Member[], profileId: number | null): string {
  if (profileId === null) {
    return "—";
  }

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
 * Built-in and custom capabilities for one organisation: definitions an
 * admin may customise, that any active member may turn into ordinary Work.
 * Recurring ones may also be put on a schedule, which generates that same
 * ordinary Work automatically. Neither path is a second task engine — both
 * end at the same Work list and detail screens as anything created by hand.
 */
export function CapabilitiesScreen() {
  const { profile } = useProfile();
  const { organisations, organisationId, setOrganisationId } =
    useAdminOrganisationPicker();

  const [capabilities, setCapabilities] = useState<Capability[] | null>(null);
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<Capability | null>(null);
  const [useTarget, setUseTarget] = useState<Capability | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<Capability | null>(null);

  const load = useCallback(async () => {
    if (!organisationId) {
      return;
    }

    try {
      const [{ capabilities: caps }, { schedules: scheds }, { members: mem }] =
        await Promise.all([
          fetchCapabilities(organisationId),
          fetchSchedules(organisationId),
          fetchOrganisationPeople(organisationId),
        ]);

      setCapabilities(caps);
      setSchedules(scheds);
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

  async function generateNow() {
    if (!organisationId) {
      return;
    }

    setBusy(true);
    setStatus(null);

    try {
      const { message } = await generateSchedules(organisationId);
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
        title="Capabilities"
        description="Built-in and custom organisational work, turned into ordinary Work items."
        actions={
          <div className="flex items-center gap-2">
            <AdminOrganisationSelect
              organisations={organisations ?? []}
              organisationId={organisationId}
              onChange={setOrganisationId}
            />

            {organisationId !== null && !creating && (
              <Button size="sm" onClick={() => setCreating(true)}>
                + New capability
              </Button>
            )}
          </div>
        }
      />

      {organisations !== null && organisations.length === 0 && (
        <StatusMessage tone="error">
          You need to administer an organisation to manage its capabilities.
        </StatusMessage>
      )}

      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {status && <StatusMessage tone={status.tone}>{status.message}</StatusMessage>}

      {organisationId !== null && (
        <>
          <Panel>
            <PanelGroup title="Capabilities">
              {creating && (
                <CapabilityForm
                  busy={busy}
                  onCancel={() => setCreating(false)}
                  onSave={async (input) => {
                    setBusy(true);
                    setStatus(null);

                    try {
                      const { message } = await createCapability({
                        organisationId,
                        ...input,
                      });

                      setStatus({ tone: "ok", message });
                      setCreating(false);
                      await load();
                    } catch (caught) {
                      setStatus({ tone: "error", message: failureMessage(caught) });
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              )}

              {capabilities === null ? (
                <p className="text-[13px] text-yz-neutral-600">Loading…</p>
              ) : capabilities.length === 0 ? (
                <p className="text-[13px] text-yz-neutral-600">No capabilities yet.</p>
              ) : (
                <ul className="divide-y divide-yz-neutral-200">
                  {capabilities.map((capability) =>
                    editTarget?.id === capability.id ? (
                      <li key={capability.id} className="py-2.5 first:pt-0 last:pb-0">
                        <CapabilityForm
                          initial={capability}
                          busy={busy}
                          onCancel={() => setEditTarget(null)}
                          onSave={async (input) => {
                            setBusy(true);
                            setStatus(null);

                            try {
                              const { message } = await updateCapability(
                                capability.id,
                                input,
                              );

                              setStatus({ tone: "ok", message });
                              setEditTarget(null);
                              await load();
                            } catch (caught) {
                              setStatus({
                                tone: "error",
                                message: failureMessage(caught),
                              });
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      </li>
                    ) : (
                      <li
                        key={capability.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-semibold text-yz-ink">
                              {capability.name}
                            </span>

                            <StatusPill tone={capability.builtIn ? "muted" : "ok"}>
                              {capability.builtIn ? "Built-in" : "Custom"}
                            </StatusPill>

                            {capability.cadence && (
                              <StatusPill tone="warn">
                                {CADENCE_LABELS[capability.cadence] ?? capability.cadence}
                              </StatusPill>
                            )}

                            {!capability.active && (
                              <StatusPill tone="danger">Inactive</StatusPill>
                            )}
                          </span>

                          {capability.description && (
                            <span className="mt-0.5 block text-[12px] leading-5 text-yz-neutral-600">
                              {capability.description}
                            </span>
                          )}
                        </span>

                        <span className="flex shrink-0 items-center gap-2">
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!capability.active}
                            onClick={() => setUseTarget(capability)}
                          >
                            Use
                          </Button>

                          {capability.cadence && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!capability.active}
                              onClick={() => setScheduleTarget(capability)}
                            >
                              Schedule
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditTarget(capability)}
                          >
                            Edit
                          </Button>
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </PanelGroup>

            <PanelGroup
              title="Recurring schedules"
              trailing={
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void generateNow()}>
                  Generate now
                </Button>
              }
            >
              {schedules === null ? (
                <p className="text-[13px] text-yz-neutral-600">Loading…</p>
              ) : schedules.length === 0 ? (
                <p className="text-[13px] leading-6 text-yz-neutral-600">
                  No recurring schedules yet — use a cadenced capability&apos;s
                  &quot;Schedule&quot; button to create one.
                </p>
              ) : (
                <ul className="divide-y divide-yz-neutral-200">
                  {schedules.map((schedule) => {
                    const capability = capabilities?.find(
                      (entry) => entry.id === schedule.capabilityId,
                    );

                    return (
                      <li
                        key={schedule.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-yz-ink">
                            {capability?.name ?? `Capability #${schedule.capabilityId}`}
                          </span>

                          <span className="block text-[12px] text-yz-neutral-600">
                            {CADENCE_LABELS[schedule.cadence] ?? schedule.cadence} · next{" "}
                            {formatDate(schedule.nextRunOn)} · assigned to{" "}
                            {memberName(members, schedule.assigneeProfileId)}
                          </span>
                        </span>

                        <StatusPill tone={schedule.active ? "ok" : "muted"}>
                          {schedule.active ? "Active" : "Inactive"}
                        </StatusPill>
                      </li>
                    );
                  })}
                </ul>
              )}
            </PanelGroup>
          </Panel>

          {useTarget && (
            <InstantiateModal
              capability={useTarget}
              members={members}
              currentProfileId={profile?.id ?? null}
              onClose={() => setUseTarget(null)}
              onSuccess={() => {
                setUseTarget(null);
              }}
            />
          )}

          {scheduleTarget && (
            <ScheduleModal
              organisationId={organisationId}
              capability={scheduleTarget}
              members={members}
              onClose={() => setScheduleTarget(null)}
              onSuccess={async (message) => {
                setStatus({ tone: "ok", message });
                setScheduleTarget(null);
                await load();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function CapabilityForm({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial?: Capability;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: {
    name: string;
    description: string | null;
    suggestedTitle: string;
    suggestedDescription: string | null;
    suggestedExpectedOutput: string | null;
    evidenceExpectation: string | null;
    defaultAssigneeRule: "caller" | "admin";
    cadence: string | null;
    active?: boolean;
  }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [suggestedTitle, setSuggestedTitle] = useState(initial?.suggestedTitle ?? "");
  const [suggestedDescription, setSuggestedDescription] = useState(
    initial?.suggestedDescription ?? "",
  );
  const [suggestedExpectedOutput, setSuggestedExpectedOutput] = useState(
    initial?.suggestedExpectedOutput ?? "",
  );
  const [evidenceExpectation, setEvidenceExpectation] = useState(
    initial?.evidenceExpectation ?? "",
  );
  const [defaultAssigneeRule, setDefaultAssigneeRule] = useState<"caller" | "admin">(
    initial?.defaultAssigneeRule ?? "caller",
  );
  const [cadence, setCadence] = useState(initial?.cadence ?? "");
  const [active, setActive] = useState(initial?.active ?? true);

  return (
    <form
      className="mb-4 rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          name,
          description: description || null,
          suggestedTitle,
          suggestedDescription: suggestedDescription || null,
          suggestedExpectedOutput: suggestedExpectedOutput || null,
          evidenceExpectation: evidenceExpectation || null,
          defaultAssigneeRule,
          cadence: cadence || null,
          ...(initial ? { active } : {}),
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id="capabilityName"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <TextField
          id="capabilitySuggestedTitle"
          label="Work title"
          hint="The title Work created from this uses by default."
          required
          value={suggestedTitle}
          onChange={(event) => setSuggestedTitle(event.target.value)}
        />
      </div>

      <div className="mt-3">
        <TextAreaField
          id="capabilityDescription"
          label="Description (optional)"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="mt-3">
        <TextAreaField
          id="capabilitySuggestedDescription"
          label="Work description (optional)"
          rows={2}
          value={suggestedDescription}
          onChange={(event) => setSuggestedDescription(event.target.value)}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextAreaField
          id="capabilitySuggestedExpectedOutput"
          label="Expected output (optional)"
          rows={2}
          value={suggestedExpectedOutput}
          onChange={(event) => setSuggestedExpectedOutput(event.target.value)}
        />

        <TextAreaField
          id="capabilityEvidenceExpectation"
          label="Evidence expectation (optional)"
          rows={2}
          value={evidenceExpectation}
          onChange={(event) => setEvidenceExpectation(event.target.value)}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <SelectField
          id="capabilityAssigneeRule"
          label="Default assignee"
          value={defaultAssigneeRule}
          onChange={(event) =>
            setDefaultAssigneeRule(event.target.value as "caller" | "admin")
          }
        >
          <option value="caller">Whoever uses it</option>
          <option value="admin">An admin</option>
        </SelectField>

        <SelectField
          id="capabilityCadence"
          label="Cadence (optional)"
          hint="Set this to make the capability schedulable."
          value={cadence}
          onChange={(event) => setCadence(event.target.value)}
        >
          <option value="">Not recurring</option>
          {CADENCES.map((value) => (
            <option key={value} value={value}>
              {CADENCE_LABELS[value] ?? value}
            </option>
          ))}
        </SelectField>

        {initial && (
          <SelectField
            id="capabilityActive"
            label="Status"
            value={active ? "active" : "inactive"}
            onChange={(event) => setActive(event.target.value === "active")}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectField>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {busy ? "Saving…" : initial ? "Save" : "Create"}
        </Button>

        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function InstantiateModal({
  capability,
  members,
  currentProfileId,
  onClose,
  onSuccess,
}: {
  capability: Capability;
  members: Member[];
  currentProfileId: number | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(capability.suggestedTitle);
  const [dueAt, setDueAt] = useState("");
  const [assigneeProfileId, setAssigneeProfileId] = useState(
    capability.defaultAssigneeRule === "caller" && currentProfileId
      ? String(currentProfileId)
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [createdWorkId, setCreatedWorkId] = useState<number | null>(null);

  return (
    <Modal open onClose={onClose} title={`Use "${capability.name}"`}>
      <div className="space-y-3">
        {status && <StatusMessage tone={status.tone}>{status.message}</StatusMessage>}

        {createdWorkId ? (
          <p className="text-[13px]">
            <Link
              href={`/work/${createdWorkId}`}
              className="font-semibold text-yz-ink underline underline-offset-4"
            >
              Open the new Work item →
            </Link>
          </p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setStatus(null);

              try {
                const { message, workItem } = await instantiateCapability(
                  capability.id,
                  {
                    title,
                    dueAt: dueAt || null,
                    assigneeProfileId: assigneeProfileId
                      ? Number(assigneeProfileId)
                      : undefined,
                  },
                );

                setStatus({ tone: "ok", message });
                setCreatedWorkId(workItem.id);
                onSuccess();
              } catch (caught) {
                setStatus({ tone: "error", message: failureMessage(caught) });
              } finally {
                setBusy(false);
              }
            }}
          >
            <TextField
              id="instantiateTitle"
              label="Title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />

            <AssigneeSelect
              id="instantiateAssignee"
              label="Assign to"
              members={members}
              value={assigneeProfileId}
              currentProfileId={currentProfileId}
              onChange={setAssigneeProfileId}
            />

            <TextField
              id="instantiateDueAt"
              label="Due date (optional)"
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />

            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={busy}>
                {busy ? "Creating…" : "Create Work"}
              </Button>

              <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

function ScheduleModal({
  organisationId,
  capability,
  members,
  onClose,
  onSuccess,
}: {
  organisationId: number;
  capability: Capability;
  members: Member[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [cadence, setCadence] = useState(capability.cadence ?? "weekly");
  const [nextRunOn, setNextRunOn] = useState(new Date().toISOString().slice(0, 10));
  const [assigneeProfileId, setAssigneeProfileId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  return (
    <Modal open onClose={onClose} title={`Schedule "${capability.name}"`}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();

          if (!assigneeProfileId) {
            setStatus({ tone: "error", message: "Choose who this schedule assigns Work to." });
            return;
          }

          setBusy(true);
          setStatus(null);

          try {
            const { message } = await createSchedule({
              organisationId,
              capabilityId: capability.id,
              cadence,
              nextRunOn,
              assigneeProfileId: Number(assigneeProfileId),
            });

            onSuccess(message);
          } catch (caught) {
            setStatus({ tone: "error", message: failureMessage(caught) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {status && <StatusMessage tone={status.tone}>{status.message}</StatusMessage>}

        <SelectField
          id="scheduleCadence"
          label="Cadence"
          value={cadence}
          onChange={(event) => setCadence(event.target.value)}
        >
          {CADENCES.map((value) => (
            <option key={value} value={value}>
              {CADENCE_LABELS[value] ?? value}
            </option>
          ))}
        </SelectField>

        <TextField
          id="scheduleNextRunOn"
          label="Next run"
          type="date"
          required
          value={nextRunOn}
          onChange={(event) => setNextRunOn(event.target.value)}
        />

        <AssigneeSelect
          id="scheduleAssignee"
          label="Assign generated Work to"
          members={members}
          value={assigneeProfileId}
          onChange={setAssigneeProfileId}
        />

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            {busy ? "Saving…" : "Create schedule"}
          </Button>

          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
