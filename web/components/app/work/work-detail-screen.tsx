"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import {
  PageHeader,
  Panel,
  PanelGroup,
  StatusMessage,
} from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { fetchOrganisationPeople, type Member } from "@/lib/organisation";
import {
  assignWorkItem,
  fetchWorkItem,
  updateWorkItem,
  WORK_STATUS_OPTIONS,
  type WorkAssignment,
  type WorkItem,
} from "@/lib/work";
import { ReadRow } from "../profile/profile-section";
import { useProfile } from "../profile/profile-provider";
import { AssigneeSelect } from "./assignee-select";
import { WorkProgress } from "./work-progress";
import { WorkStatusPill } from "./work-status-pill";

type Status = { tone: "ok" | "error"; message: string } | null;

const EMPTY_ASSIGN = { assigneeProfileId: "", instructions: "" };

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

function formFromItem(item: WorkItem) {
  return {
    title: item.title,
    description: item.description ?? "",
    expectedOutput: item.expectedOutput ?? "",
    dueAt: item.dueAt ? item.dueAt.slice(0, 10) : "",
    status: item.status as string,
    progress: String(item.progress),
  };
}

/** active reads current, cancelled reads as a stop, everything else neutral. */
function AssignmentStatusPill({ status }: { status: string }) {
  return (
    <StatusPill
      tone={
        status === "active" ? "ok" : status === "cancelled" ? "danger" : "muted"
      }
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </StatusPill>
  );
}

/**
 * One Work Item: what it is, who created it, who currently owns it, who
 * assigned it, and the full chain of assignments before that — nothing here
 * is ever overwritten or hidden, matching the backend's own history model.
 */
export function WorkDetailScreen({ workItemId }: { workItemId: number }) {
  const { profile } = useProfile();

  const [workItem, setWorkItem] = useState<WorkItem | null>(null);
  const [activeAssignment, setActiveAssignment] =
    useState<WorkAssignment | null>(null);
  const [history, setHistory] = useState<WorkAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => formFromItem({
    id: 0, organisationId: 0, title: "", description: null, expectedOutput: null,
    status: "not_started", progress: 0, dueAt: null, createdBy: 0,
    createdAt: "", updatedAt: "",
  }));
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editStatus, setEditStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  const [reassigning, setReassigning] = useState(false);
  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGN);
  const [assignErrors, setAssignErrors] = useState<Record<string, string>>({});
  const [assignStatus, setAssignStatus] = useState<Status>(null);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(
    async (preserveEditForm = false) => {
      try {
        const result = await fetchWorkItem(workItemId);

        setWorkItem(result.workItem);
        setActiveAssignment(result.activeAssignment);
        setHistory(result.assignmentHistory);

        // A reassignment completing while the Edit form is open must not
        // clobber whatever the person is still mid-typing there.
        if (!preserveEditForm) {
          setForm(formFromItem(result.workItem));
        }

        setError(null);
        setNotFound(false);

        try {
          const { members: next } = await fetchOrganisationPeople(
            result.workItem.organisationId,
          );

          setMembers(next);
        } catch {
          // Names and reassignment become unavailable, but the Work Item
          // itself must still render.
        }
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 404) {
          setNotFound(true);
          setError(null);
          return;
        }

        setError(failureMessage(caught));
      }
    },
    [workItemId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function nameFor(profileId: number): string {
    const member = members.find((entry) => entry.profileId === profileId);
    return member?.fullName ?? member?.email ?? `Person #${profileId}`;
  }

  async function saveEdit() {
    if (!workItem) {
      return;
    }

    setSaving(true);
    setEditErrors({});
    setEditStatus(null);

    try {
      const { message } = await updateWorkItem(workItem.id, {
        title: form.title,
        description: form.description || null,
        expectedOutput: form.expectedOutput || null,
        dueAt: form.dueAt || null,
        status: form.status as WorkItem["status"],
        progress: Number(form.progress),
      });

      setEditStatus({ tone: "ok", message });
      setEditing(false);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setEditErrors(caught.byField());

        if (caught.errors.length === 0) {
          setEditStatus({ tone: "error", message: caught.message });
        }
      } else {
        setEditStatus({ tone: "error", message: failureMessage(caught) });
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitReassign() {
    if (!workItem) {
      return;
    }

    setAssigning(true);
    setAssignErrors({});
    setAssignStatus(null);

    try {
      const { message } = await assignWorkItem(workItem.id, {
        assigneeProfileId: Number(assignForm.assigneeProfileId),
        instructions: assignForm.instructions || null,
      });

      setAssignStatus({ tone: "ok", message });
      setReassigning(false);
      setAssignForm(EMPTY_ASSIGN);
      // Preserve whatever is still mid-typing in the Edit form, if it's
      // open — this reassignment must not silently discard it.
      await load(editing);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setAssignErrors(caught.byField());

        if (caught.errors.length === 0) {
          setAssignStatus({ tone: "error", message: caught.message });
        }
      } else {
        setAssignStatus({ tone: "error", message: failureMessage(caught) });
      }
    } finally {
      setAssigning(false);
    }
  }

  if (notFound) {
    return (
      <div className="space-y-3">
        <PageHeader title="Work" />

        <StatusMessage tone="error">
          That work item could not be found.{" "}
          <Link href="/work" className="font-bold underline underline-offset-4">
            Back to Work
          </Link>
        </StatusMessage>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <PageHeader title="Work" />

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
      </div>
    );
  }

  if (!workItem) {
    return <p className="text-[13px] text-yz-neutral-600">Loading…</p>;
  }

  const isCreator = profile?.id === workItem.createdBy;
  const isOwner = profile?.id === activeAssignment?.assigneeProfileId;
  const canEdit = isCreator || isOwner;

  return (
    <div className="space-y-3">
      <PageHeader
        title={workItem.title}
        description={`Created ${formatShortDate(workItem.createdAt)}`}
        actions={
          <Link
            href="/work"
            className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
          >
            All Work
          </Link>
        }
      />

      <Panel>
        <PanelGroup
          title="Overview"
          trailing={
            canEdit &&
            !editing && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )
          }
        >
          {editStatus && (
            <StatusMessage tone={editStatus.tone} className="mb-3">
              {editStatus.message}
            </StatusMessage>
          )}

          {!editing ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <WorkStatusPill status={workItem.status} />
                <WorkProgress value={workItem.progress} />
              </div>

              <dl>
                <ReadRow label="Description" value={workItem.description} />
                <ReadRow
                  label="Expected output"
                  value={workItem.expectedOutput}
                />
                <ReadRow
                  label="Due date"
                  value={formatShortDate(workItem.dueAt)}
                />
              </dl>
            </>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveEdit();
              }}
            >
              <div className="grid gap-3">
                <TextField
                  id="editTitle"
                  label="Title"
                  value={form.title}
                  error={editErrors.title}
                  onChange={(event) =>
                    setForm((c) => ({ ...c, title: event.target.value }))
                  }
                />

                <TextAreaField
                  id="editDescription"
                  label="Description"
                  value={form.description}
                  error={editErrors.description}
                  onChange={(event) =>
                    setForm((c) => ({ ...c, description: event.target.value }))
                  }
                />

                <TextAreaField
                  id="editExpectedOutput"
                  label="Expected output"
                  value={form.expectedOutput}
                  error={editErrors.expectedOutput}
                  onChange={(event) =>
                    setForm((c) => ({
                      ...c,
                      expectedOutput: event.target.value,
                    }))
                  }
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField
                    id="editDueAt"
                    label="Due date"
                    type="date"
                    value={form.dueAt}
                    error={editErrors.dueAt}
                    onChange={(event) =>
                      setForm((c) => ({ ...c, dueAt: event.target.value }))
                    }
                  />

                  <SelectField
                    id="editStatus"
                    label="Status"
                    value={form.status}
                    error={editErrors.status}
                    onChange={(event) =>
                      setForm((c) => ({ ...c, status: event.target.value }))
                    }
                  >
                    {WORK_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>

                  <TextField
                    id="editProgress"
                    label="Progress"
                    type="number"
                    min={0}
                    max={100}
                    value={form.progress}
                    error={editErrors.progress}
                    onChange={(event) =>
                      setForm((c) => ({ ...c, progress: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setForm(formFromItem(workItem));
                    setEditErrors({});
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </PanelGroup>

        <PanelGroup
          title="People"
          trailing={
            isCreator &&
            !reassigning && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setReassigning(true)}
              >
                Reassign
              </Button>
            )
          }
        >
          {assignStatus && (
            <StatusMessage tone={assignStatus.tone} className="mb-3">
              {assignStatus.message}
            </StatusMessage>
          )}

          <dl>
            <ReadRow label="Created by" value={nameFor(workItem.createdBy)} />

            <ReadRow
              label="Currently assigned to"
              value={
                activeAssignment
                  ? nameFor(activeAssignment.assigneeProfileId)
                  : "Nobody — reassign to give this an owner"
              }
            />

            {activeAssignment && (
              <ReadRow
                label="Assigned by"
                value={nameFor(activeAssignment.assignedBy)}
              />
            )}

            {activeAssignment?.instructions && (
              <ReadRow
                label="Instructions"
                value={activeAssignment.instructions}
              />
            )}
          </dl>

          {reassigning && (
            <form
              className="mt-3 rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 p-3.5"
              onSubmit={(event) => {
                event.preventDefault();
                void submitReassign();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <AssigneeSelect
                  id="reassignTo"
                  label="Reassign to"
                  members={members}
                  value={assignForm.assigneeProfileId}
                  error={assignErrors.assigneeProfileId}
                  onChange={(value) =>
                    setAssignForm((c) => ({ ...c, assigneeProfileId: value }))
                  }
                />

                <TextField
                  id="reassignInstructions"
                  label="Instructions"
                  hint="Optional."
                  value={assignForm.instructions}
                  error={assignErrors.instructions}
                  onChange={(event) =>
                    setAssignForm((c) => ({
                      ...c,
                      instructions: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={assigning}
                >
                  {assigning ? "Reassigning…" : "Confirm reassignment"}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={assigning}
                  onClick={() => {
                    setReassigning(false);
                    setAssignForm(EMPTY_ASSIGN);
                    setAssignErrors({});
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </PanelGroup>

        <PanelGroup title="Assignment history">
          {history.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">
              No assignment history yet.
            </p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {history.map((assignment) => (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-yz-ink">
                      {nameFor(assignment.assigneeProfileId)}
                    </span>

                    <span className="block truncate text-[12px] text-yz-neutral-600">
                      Assigned by {nameFor(assignment.assignedBy)} ·{" "}
                      {formatShortDate(assignment.createdAt)}
                      {assignment.instructions
                        ? ` · ${assignment.instructions}`
                        : ""}
                    </span>
                  </span>

                  <AssignmentStatusPill status={assignment.status} />
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
