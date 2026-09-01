"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  PageHeader,
  Panel,
  PanelGroup,
  StatusMessage,
} from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError, assetUrl } from "@/lib/api";
import { fetchDepartments, type DepartmentSummary } from "@/lib/departments";
import { formatShortDate } from "@/lib/format";
import { fetchOrganisationPeople, type Member } from "@/lib/organisation";
import { fetchProjects, type Project } from "@/lib/projects";
import {
  acceptReport,
  assignWorkItem,
  createReport,
  fetchWorkItem,
  REPORT_STATE_LABELS,
  returnReport,
  submitReport,
  updateReportDraft,
  updateWorkItem,
  uploadReportAttachment,
  WORK_STATUS_OPTIONS,
  type ReportState,
  type WorkAssignment,
  type WorkItem,
  type WorkReport,
} from "@/lib/work";
import { ReadRow } from "../profile/profile-section";
import { useProfile } from "../profile/profile-provider";
import { AssigneeSelect } from "./assignee-select";
import { WorkProgress } from "./work-progress";
import { WorkStatusPill } from "./work-status-pill";

type Status = { tone: "ok" | "error"; message: string } | null;

const EMPTY_ASSIGN = { assigneeProfileId: "", instructions: "" };

const EMPTY_EDIT = {
  title: "",
  description: "",
  expectedOutput: "",
  dueAt: "",
  status: "not_started",
  progress: "0",
};

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

function isOverdue(item: WorkItem): boolean {
  return (
    item.dueAt !== null &&
    item.status !== "done" &&
    item.status !== "cancelled" &&

    new Date(item.dueAt).getTime() < Date.now()
  );
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

/** draft neutral, submitted awaiting, accepted resolved, returned a problem. */
function ReportStatePill({ state }: { state: ReportState }) {
  const tone =
    state === "accepted"
      ? "ok"
      : state === "returned"
        ? "danger"
        : state === "submitted"
          ? "warn"
          : "muted";

  return <StatusPill tone={tone}>{REPORT_STATE_LABELS[state]}</StatusPill>;
}

/**
 * One Work Item end to end: what it is and how it is linked, who owns it and
 * the full assignment chain, the child work beneath it, and the report trail
 * — draft, submit, evidence, accept or return — nothing here is ever
 * overwritten or hidden, matching the backend's own history model.
 */
export function WorkDetailScreen({ workItemId }: { workItemId: number }) {
  const { profile } = useProfile();

  const [workItem, setWorkItem] = useState<WorkItem | null>(null);
  const [activeAssignment, setActiveAssignment] =
    useState<WorkAssignment | null>(null);
  const [history, setHistory] = useState<WorkAssignment[]>([]);
  const [children, setChildren] = useState<WorkItem[]>([]);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [parentTitle, setParentTitle] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_EDIT);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editStatus, setEditStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  const [reassigning, setReassigning] = useState(false);
  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGN);
  const [assignErrors, setAssignErrors] = useState<Record<string, string>>({});
  const [assignStatus, setAssignStatus] = useState<Status>(null);
  const [assigning, setAssigning] = useState(false);

  const [reportStatus, setReportStatus] = useState<Status>(null);
  const [newReportBody, setNewReportBody] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [returnFor, setReturnFor] = useState<number | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnError, setReturnError] = useState<string | null>(null);

  const load = useCallback(
    async (preserveEditForm = false) => {
      try {
        const result = await fetchWorkItem(workItemId);

        setWorkItem(result.workItem);
        setActiveAssignment(result.activeAssignment);
        setHistory(result.assignmentHistory);
        setChildren(result.children);
        setReports(result.reports);

        // A reassignment or report action completing while the Edit form is
        // open must not clobber whatever the person is still mid-typing.
        if (!preserveEditForm) {
          setForm(formFromItem(result.workItem));
        }

        setError(null);
        setNotFound(false);

        const org = result.workItem.organisationId;

        try {
          const { members: next } = await fetchOrganisationPeople(org);
          setMembers(next);
        } catch {
          // Names and reassignment become unavailable, but the item still
          // renders.
        }

        // Names for the optional links — best-effort, never blocking.
        void fetchProjects(org)
          .then(({ projects: next }) => setProjects(next))
          .catch(() => setProjects([]));

        void fetchDepartments(org)
          .then(({ departments: next }) => setDepartments(next))
          .catch(() => setDepartments([]));

        if (result.workItem.parentId !== null) {
          void fetchWorkItem(result.workItem.parentId)
            .then(({ workItem: parent }) => setParentTitle(parent.title))
            .catch(() => setParentTitle(null));
        } else {
          setParentTitle(null);
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

  // The single non-terminal report, if any — at most one exists at a time.
  const openReport = useMemo(
    () =>
      reports.find(
        (report) => report.state === "draft" || report.state === "submitted",
      ) ?? null,
    [reports],
  );

  const myOpenDraftId =
    openReport &&
    openReport.state === "draft" &&
    openReport.authorProfileId === profile?.id
      ? openReport.id
      : null;

  // Keep the draft editor in sync with the open draft, without clobbering
  // typing on the intermediate re-renders that a keystroke causes.
  const lastDraftIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (lastDraftIdRef.current !== myOpenDraftId) {
      lastDraftIdRef.current = myOpenDraftId;

      setDraftBody(openReport && openReport.id === myOpenDraftId ? openReport.body : "");
    }
  }, [myOpenDraftId, openReport]);

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

  async function runReportAction(
    action: () => Promise<{ message: string }>,
    onSuccess?: () => void,
  ) {
    if (!workItem) {
      return;
    }

    setReportBusy(true);
    setReportStatus(null);

    try {
      const { message } = await action();
      setReportStatus({ tone: "ok", message });
      onSuccess?.();
      await load(editing);
    } catch (caught) {
      setReportStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setReportBusy(false);
    }
  }

  async function uploadEvidence(reportId: number, file: File) {
    if (!workItem) {
      return;
    }

    setUploadingId(reportId);
    setReportStatus(null);

    try {
      await uploadReportAttachment(workItem.id, reportId, file);
      setReportStatus({ tone: "ok", message: "Evidence attached." });
      await load(editing);
    } catch (caught) {
      setReportStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setUploadingId(null);
    }
  }

  async function confirmReturn() {
    if (!workItem || returnFor === null) {
      return;
    }

    setReportBusy(true);
    setReturnError(null);

    try {
      const { message } = await returnReport(
        workItem.id,
        returnFor,
        returnReason,
      );
      setReportStatus({ tone: "ok", message });
      setReturnFor(null);
      setReturnReason("");
      await load(editing);
    } catch (caught) {
      setReturnError(failureMessage(caught));
    } finally {
      setReportBusy(false);
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
  const isAdmin =
    members.find((entry) => entry.profileId === profile?.id)?.isAdmin ?? false;
  const canEdit = isCreator || isOwner;
  // Reassignment is now allowed for the creator or an active org admin.
  const canReassign = isCreator || isAdmin;
  // Only the current active assignee writes reports.
  const isActiveAssignee = isOwner;
  // Only the work creator or an org admin reviews them.
  const isReviewer = isCreator || isAdmin;

  const projectName =
    workItem.projectId !== null
      ? (projects.find((project) => project.id === workItem.projectId)?.name ??
        `Project #${workItem.projectId}`)
      : null;

  const departmentName =
    workItem.departmentId !== null
      ? (departments.find(
          (department) => department.id === workItem.departmentId,
        )?.name ?? `Department #${workItem.departmentId}`)
      : null;

  const hasLinks =
    projectName !== null ||
    departmentName !== null ||
    workItem.parentId !== null;

  const overdue = isOverdue(workItem);
  // Newest first for reading; the API returns them oldest first.
  const reportsNewestFirst = [...reports].reverse();
  const canWriteNewReport = isActiveAssignee && openReport === null;

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
                {overdue && <StatusPill tone="danger">Overdue</StatusPill>}
              </div>

              <dl>
                <ReadRow label="Description" value={workItem.description} />
                <ReadRow
                  label="Expected output"
                  value={workItem.expectedOutput}
                />
                <ReadRow
                  label="Due date"
                  value={
                    workItem.dueAt ? (
                      <span className={overdue ? "text-yz-danger-ink" : undefined}>
                        {formatShortDate(workItem.dueAt)}
                        {overdue ? " · overdue" : ""}
                      </span>
                    ) : null
                  }
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

        {hasLinks && (
          <PanelGroup title="Links">
            <dl>
              {projectName !== null && (
                <ReadRow label="Project" value={projectName} />
              )}

              {departmentName !== null && (
                <ReadRow label="Department scope" value={departmentName} />
              )}

              {workItem.parentId !== null && (
                <ReadRow
                  label="Parent work"
                  value={
                    <Link
                      href={`/work/${workItem.parentId}`}
                      className="font-semibold text-yz-ink underline underline-offset-4 hover:opacity-80"
                    >
                      {parentTitle ?? `Work #${workItem.parentId}`}
                    </Link>
                  }
                />
              )}
            </dl>
          </PanelGroup>
        )}

        <PanelGroup
          title="People"
          trailing={
            canReassign &&
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
                  currentProfileId={profile?.id ?? null}
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

      {/* Child work — one level only, offered from a top-level item. */}
      {(workItem.parentId === null || children.length > 0) && (
        <Panel>
          <PanelGroup
            title="Child work"
            trailing={
              workItem.parentId === null && (
                <Link
                  href={`/work/new?parentId=${workItem.id}`}
                  className="inline-flex items-center rounded-sm border border-yz-neutral-300 bg-yz-panel px-3 py-1.5 text-[12px] font-bold text-yz-ink transition-colors duration-150 hover:border-yz-ink"
                >
                  + Add child work
                </Link>
              )
            }
          >
            {children.length === 0 ? (
              <p className="text-[13px] text-yz-neutral-600">
                No child work yet.
              </p>
            ) : (
              <ul className="divide-y divide-yz-neutral-200">
                {children.map((child) => (
                  <li key={child.id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link
                      href={`/work/${child.id}`}
                      className="-mx-2 flex flex-wrap items-center justify-between gap-3 rounded-sm px-2 py-1 transition-colors duration-150 hover:bg-yz-neutral-100"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-yz-ink">
                          {child.title}
                        </span>
                        <span className="block truncate text-[12px] text-yz-neutral-600">
                          {child.progress}% · Due{" "}
                          {formatShortDate(child.dueAt) ?? "—"}
                        </span>
                      </span>

                      <WorkStatusPill status={child.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PanelGroup>
        </Panel>
      )}

      {/* Reports — the evidence trail and its review. */}
      <Panel>
        <PanelGroup title="Reports">
          {reportStatus && (
            <StatusMessage tone={reportStatus.tone} className="mb-3">
              {reportStatus.message}
            </StatusMessage>
          )}

          {canWriteNewReport && (
            <form
              className="mb-4 rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 p-3.5"
              onSubmit={(event) => {
                event.preventDefault();
                void runReportAction(
                  () =>
                    createReport(workItem.id, {
                      body: newReportBody,
                      submit: false,
                    }),
                  () => setNewReportBody(""),
                );
              }}
            >
              <TextAreaField
                id="newReportBody"
                label="Write a report"
                hint="Describe what you did. Save a draft or submit it for review."
                value={newReportBody}
                onChange={(event) => setNewReportBody(event.target.value)}
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={reportBusy}
                >
                  Save draft
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={reportBusy}
                  onClick={() =>
                    void runReportAction(
                      () =>
                        createReport(workItem.id, {
                          body: newReportBody,
                          submit: true,
                        }),
                      () => setNewReportBody(""),
                    )
                  }
                >
                  Submit for review
                </Button>
              </div>
            </form>
          )}

          {reports.length === 0 && !canWriteNewReport ? (
            <p className="text-[13px] text-yz-neutral-600">No reports yet.</p>
          ) : (
            <ul className="space-y-3">
              {reportsNewestFirst.map((report) => {
                const isAuthor = report.authorProfileId === profile?.id;
                const isOpenDraft =
                  report.id === openReport?.id && report.state === "draft";
                const isOpenSubmitted =
                  report.id === openReport?.id && report.state === "submitted";

                return (
                  <li
                    key={report.id}
                    className="rounded-sm border border-yz-neutral-200 p-3.5"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[13px] font-semibold text-yz-ink">
                        {nameFor(report.authorProfileId)}
                      </span>

                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-yz-neutral-600">
                          {formatShortDate(
                            report.submittedAt ?? report.createdAt,
                          )}
                        </span>
                        <ReportStatePill state={report.state} />
                      </div>
                    </div>

                    {isOpenDraft && isAuthor ? (
                      <TextAreaField
                        id={`draftBody-${report.id}`}
                        label="Report"
                        value={draftBody}
                        onChange={(event) => setDraftBody(event.target.value)}
                      />
                    ) : (
                      <p className="text-[13px] leading-6 whitespace-pre-wrap text-yz-ink">
                        {report.body}
                      </p>
                    )}

                    {report.state === "returned" && report.decisionReason && (
                      <p className="mt-2 rounded-sm border border-yz-danger-line bg-yz-danger-bg px-3 py-2 text-[12.5px] text-yz-danger-ink">
                        Returned: {report.decisionReason}
                      </p>
                    )}

                    {report.reviewedByProfileId !== null && (
                      <p className="mt-2 text-[12px] text-yz-neutral-600">
                        Reviewed by {nameFor(report.reviewedByProfileId)}
                        {report.reviewedAt
                          ? ` · ${formatShortDate(report.reviewedAt)}`
                          : ""}
                      </p>
                    )}

                    {report.attachments.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {report.attachments.map((attachment) => (
                          <li key={attachment.id}>
                            <a
                              href={assetUrl(attachment.url) ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex max-w-full items-center gap-1 rounded-sm border border-yz-neutral-300 bg-yz-panel px-2.5 py-1 text-[12px] font-semibold text-yz-ink transition-colors duration-150 hover:border-yz-ink"
                            >
                              <span className="truncate">
                                {attachment.fileName}
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Author actions on the open report. */}
                    {isAuthor && (isOpenDraft || isOpenSubmitted) && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {isOpenDraft && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={reportBusy}
                              onClick={() =>
                                void runReportAction(() =>
                                  updateReportDraft(
                                    workItem.id,
                                    report.id,
                                    draftBody,
                                  ),
                                )
                              }
                            >
                              Save draft
                            </Button>

                            <Button
                              variant="primary"
                              size="sm"
                              disabled={reportBusy}
                              onClick={() =>
                                void runReportAction(() =>
                                  submitReport(workItem.id, report.id),
                                )
                              }
                            >
                              Submit for review
                            </Button>
                          </>
                        )}

                        <label className="inline-flex cursor-pointer items-center rounded-sm border border-yz-neutral-300 bg-yz-panel px-3 py-1.5 text-[12px] font-bold text-yz-ink transition-colors duration-150 hover:border-yz-ink">
                          {uploadingId === report.id
                            ? "Attaching…"
                            : "Attach evidence"}
                          <input
                            type="file"
                            className="sr-only"
                            disabled={uploadingId !== null}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                void uploadEvidence(report.id, file);
                              }
                              event.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    )}

                    {/* Reviewer actions on a submitted report. */}
                    {isOpenSubmitted && isReviewer && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={reportBusy}
                          onClick={() =>
                            void runReportAction(() =>
                              acceptReport(workItem.id, report.id),
                            )
                          }
                        >
                          Accept
                        </Button>

                        <Button
                          variant="danger"
                          size="sm"
                          disabled={reportBusy}
                          onClick={() => {
                            setReturnFor(report.id);
                            setReturnReason("");
                            setReturnError(null);
                          }}
                        >
                          Return
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </PanelGroup>
      </Panel>

      <Modal
        open={returnFor !== null}
        onClose={() => setReturnFor(null)}
        title="Return this report"
        description="Tell the assignee what needs to change. They can then submit a new report."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void confirmReturn();
          }}
        >
          {returnError && (
            <StatusMessage tone="error" className="mb-3">
              {returnError}
            </StatusMessage>
          )}

          <TextAreaField
            id="returnReason"
            label="Reason"
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
          />

          <div className="mt-4 flex items-center gap-2">
            <Button
              type="submit"
              variant="danger"
              size="sm"
              disabled={reportBusy}
            >
              {reportBusy ? "Returning…" : "Return report"}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              disabled={reportBusy}
              onClick={() => setReturnFor(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
