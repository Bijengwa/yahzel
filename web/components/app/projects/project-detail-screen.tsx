"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import {
  PageHeader,
  Panel,
  PanelGroup,
  PanelRow,
  StatusMessage,
} from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import { fetchDepartments, type DepartmentSummary } from "@/lib/departments";
import { formatMonthYear, formatRelativeDay, formatShortDate } from "@/lib/format";
import { fetchOrganisationPeople, type Member } from "@/lib/organisation";
import {
  addProjectMember,
  archiveProject,
  createProjectOutcome,
  fetchProject,
  linkProjectWork,
  OUTCOME_STATUSES,
  outcomeStatusLabel,
  PROJECT_STATUSES,
  projectStatusLabel,
  removeProjectMember,
  unarchiveProject,
  unlinkProjectWork,
  updateProject,
  updateProjectOutcome,
  updateProjectStatus,
  type OutcomeStatus,
  type Project,
  type ProjectEvent,
  type ProjectHealth,
  type ProjectMember,
  type ProjectOutcome,
  type ProjectOverview,
  type ProjectStatus,
  type ProjectWorkItem,
} from "@/lib/projects";
import { fetchWorkItems, type WorkItemSummary } from "@/lib/work";
import { ReadRow } from "../profile/profile-section";
import { useProfile } from "../profile/profile-provider";
import { AssigneeSelect } from "../work/assignee-select";
import { WorkProgress } from "../work/work-progress";
import { WorkStatusPill } from "../work/work-status-pill";
import { ProjectStatusPill } from "./project-status-pill";

type Status = { tone: "ok" | "error"; message: string } | null;

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

function detailsForm(project: Project) {
  return {
    name: project.name,
    description: project.description ?? "",
    departmentId: project.departmentId !== null ? String(project.departmentId) : "",
    startDate: project.startDate ? project.startDate.slice(0, 10) : "",
    targetEndDate: project.targetEndDate ? project.targetEndDate.slice(0, 10) : "",
    ownerProfileId: String(project.ownerProfileId),
  };
}

function HealthPanel({ health }: { health: ProjectHealth }) {
  return (
    <Panel>
      <PanelGroup title="Project health">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {[
            { label: "Total work", value: health.totalWork },
            { label: "Open", value: health.openWork },
            { label: "Completed", value: health.completedWork },
            { label: "Overdue", value: health.overdueWork, danger: health.overdueWork > 0 },
            { label: "Blocked", value: health.blockedWork, danger: health.blockedWork > 0 },
            { label: "Stalled", value: health.stalledWork, danger: health.stalledWork > 0 },
          ].map((stat) => (
            <div key={stat.label} className="rounded-sm border border-yz-neutral-200 px-3 py-2.5">
              <div
                className={`text-[19px] font-extrabold tabular-nums ${
                  stat.danger ? "text-yz-danger-ink" : "text-yz-ink"
                }`}
              >
                {stat.value}
              </div>
              <div className="text-[11px] font-semibold text-yz-neutral-600">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-1.5">
          {health.signals.map((signal, index) => (
            <p key={index} className="text-[13px] leading-6 text-yz-neutral-700">
              {signal}
            </p>
          ))}
        </div>

        <p className="mt-2 text-[12px] text-yz-neutral-500">
          Outcomes: {health.outcomesDone} of {health.outcomesTotal} done
          {health.outcomesOverdue > 0 ? ` · ${health.outcomesOverdue} past target` : ""}
        </p>
      </PanelGroup>
    </Panel>
  );
}

export function ProjectDetailScreen({
  projectId,
  organisationId,
}: {
  projectId: number;
  organisationId: number;
}) {
  const { profile } = useProfile();

  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [orgMembers, setOrgMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [unlinkedWork, setUnlinkedWork] = useState<WorkItemSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsFormState, setDetailsFormState] = useState<ReturnType<typeof detailsForm> | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});

  const [newMemberId, setNewMemberId] = useState("");
  const [statusChoice, setStatusChoice] = useState<ProjectStatus | "">("");

  const [outcomeForm, setOutcomeForm] = useState({ title: "", targetDate: "" });
  const [outcomeErrors, setOutcomeErrors] = useState<Record<string, string>>({});

  const [linkWorkId, setLinkWorkId] = useState("");

  const load = useCallback(async () => {
    try {
      const [detail, people] = await Promise.all([
        fetchProject(organisationId, projectId),
        fetchOrganisationPeople(organisationId).catch(() => ({
          members: [] as Member[],
        })),
      ]);

      setOverview(detail);
      setOrgMembers(people.members);
      setLoadError(null);

      const [departmentList, allWork] = await Promise.all([
        fetchDepartments(organisationId).catch(() => ({
          departments: [] as DepartmentSummary[],
        })),
        fetchWorkItems().catch(() => ({ workItems: [] as WorkItemSummary[] })),
      ]);

      setDepartments(departmentList.departments);
      setUnlinkedWork(
        allWork.workItems.filter(
          (item) => item.organisationId === organisationId && item.projectId === null,
        ),
      );
    } catch (caught) {
      setLoadError(failureMessage(caught));
    }
  }, [organisationId, projectId]);

  useEffect(() => {
    // Synchronising with an external system — the Yahzel API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!overview) {
    return loadError ? (
      <StatusMessage tone="error">{loadError}</StatusMessage>
    ) : (
      <p className="text-[13px] text-yz-neutral-600">Loading…</p>
    );
  }

  const { project, members, outcomes, work, health, events } = overview;

  const memberName = (profileId: number | null) => {
    if (profileId === null) {
      return "Unassigned";
    }
    return (
      orgMembers.find((entry) => entry.profileId === profileId)?.fullName ??
      `Member #${profileId}`
    );
  };

  const selfMembership = orgMembers.find((entry) => entry.profileId === profile?.id);
  const isManager =
    (profile && profile.id === project.ownerProfileId) || selfMembership?.isAdmin === true;

  const eligibleNewMembers = orgMembers.filter(
    (entry) =>
      entry.status === "active" &&
      entry.profileId !== null &&
      entry.profileId !== project.ownerProfileId &&
      !members.some((member) => member.profileId === entry.profileId),
  );

  async function saveDetails() {
    if (!detailsFormState) return;

    setDetailErrors({});
    try {
      await updateProject(organisationId, projectId, {
        name: detailsFormState.name,
        description: detailsFormState.description || null,
        departmentId: detailsFormState.departmentId ? Number(detailsFormState.departmentId) : null,
        startDate: detailsFormState.startDate || null,
        targetEndDate: detailsFormState.targetEndDate || null,
        ownerProfileId: Number(detailsFormState.ownerProfileId),
      });
      setEditingDetails(false);
      setStatus({ tone: "ok", message: "Project details updated." });
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setDetailErrors(caught.byField());
      }
      setStatus({ tone: "error", message: failureMessage(caught) });
    }
  }

  async function changeStatus() {
    if (!statusChoice) return;
    try {
      await updateProjectStatus(organisationId, projectId, statusChoice);
      setStatusChoice("");
      setStatus({ tone: "ok", message: "Project status changed." });
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    }
  }

  async function toggleArchive() {
    try {
      if (project.archivedAt) {
        await unarchiveProject(organisationId, projectId);
        setStatus({ tone: "ok", message: "Project restored from the archive." });
      } else {
        await archiveProject(organisationId, projectId);
        setStatus({ tone: "ok", message: "Project archived." });
      }
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    }
  }

  async function addMember() {
    if (!newMemberId) return;
    try {
      await addProjectMember(organisationId, projectId, Number(newMemberId));
      setNewMemberId("");
      setStatus({ tone: "ok", message: "Contributor added." });
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    }
  }

  async function removeMember(member: ProjectMember) {
    try {
      await removeProjectMember(organisationId, projectId, member.profileId);
      setStatus({ tone: "ok", message: `${member.name} removed.` });
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    }
  }

  async function addOutcome() {
    setOutcomeErrors({});
    try {
      await createProjectOutcome(organisationId, projectId, {
        title: outcomeForm.title,
        targetDate: outcomeForm.targetDate || null,
      });
      setOutcomeForm({ title: "", targetDate: "" });
      setStatus({ tone: "ok", message: "Outcome added." });
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setOutcomeErrors(caught.byField());
      }
      setStatus({ tone: "error", message: failureMessage(caught) });
    }
  }

  async function changeOutcomeStatus(outcome: ProjectOutcome, next: OutcomeStatus) {
    try {
      await updateProjectOutcome(organisationId, projectId, outcome.id, { status: next });
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    }
  }

  async function linkWork() {
    if (!linkWorkId) return;
    try {
      await linkProjectWork(organisationId, projectId, Number(linkWorkId));
      setLinkWorkId("");
      setStatus({ tone: "ok", message: "Work linked." });
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    }
  }

  async function unlinkWork(item: ProjectWorkItem) {
    try {
      await unlinkProjectWork(organisationId, projectId, item.id);
      setStatus({ tone: "ok", message: `"${item.title}" unlinked.` });
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        actions={
          <div className="flex items-center gap-3">
            <ProjectStatusPill status={project.status} />
            <Link
              href="/projects"
              className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
            >
              Back
            </Link>
          </div>
        }
      />

      {status && <StatusMessage tone={status.tone}>{status.message}</StatusMessage>}
      {project.archivedAt !== null && (
        <StatusMessage tone="error">
          This project is archived. It is hidden from the default list but nothing was deleted.
        </StatusMessage>
      )}

      <HealthPanel health={health} />

      <Panel>
        <PanelGroup
          title="Details"
          trailing={
            isManager &&
            !editingDetails && (
              <Button
                size="sm"
                onClick={() => {
                  setDetailsFormState(detailsForm(project));
                  setEditingDetails(true);
                }}
              >
                Edit
              </Button>
            )
          }
        >
          {editingDetails && detailsFormState ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveDetails();
              }}
              className="grid max-w-xl gap-3"
            >
              <TextField
                id="projectDetailName"
                label="Name"
                value={detailsFormState.name}
                error={detailErrors.name}
                onChange={(event) =>
                  setDetailsFormState({ ...detailsFormState, name: event.target.value })
                }
              />

              <TextAreaField
                id="projectDetailDescription"
                label="Description"
                value={detailsFormState.description}
                error={detailErrors.description}
                onChange={(event) =>
                  setDetailsFormState({ ...detailsFormState, description: event.target.value })
                }
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  id="projectDetailStart"
                  label="Start date"
                  type="date"
                  value={detailsFormState.startDate}
                  error={detailErrors.startDate}
                  onChange={(event) =>
                    setDetailsFormState({ ...detailsFormState, startDate: event.target.value })
                  }
                />

                <TextField
                  id="projectDetailTarget"
                  label="Target end date"
                  type="date"
                  value={detailsFormState.targetEndDate}
                  error={detailErrors.targetEndDate}
                  onChange={(event) =>
                    setDetailsFormState({ ...detailsFormState, targetEndDate: event.target.value })
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <AssigneeSelect
                  id="projectDetailOwner"
                  label="Owner"
                  members={orgMembers}
                  value={detailsFormState.ownerProfileId}
                  error={detailErrors.ownerProfileId}
                  currentProfileId={profile?.id ?? null}
                  onChange={(value) =>
                    setDetailsFormState({ ...detailsFormState, ownerProfileId: value })
                  }
                />

                <SelectField
                  id="projectDetailDepartment"
                  label="Department scope"
                  value={detailsFormState.departmentId}
                  error={detailErrors.departmentId}
                  onChange={(event) =>
                    setDetailsFormState({ ...detailsFormState, departmentId: event.target.value })
                  }
                >
                  <option value="">— none —</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </SelectField>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" size="sm">
                  Save
                </Button>
                <Button type="button" size="sm" onClick={() => setEditingDetails(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <dl>
              <ReadRow label="Owner" value={memberName(project.ownerProfileId)} />
              <ReadRow
                label="Department"
                value={
                  project.departmentId !== null
                    ? (departments.find((d) => d.id === project.departmentId)?.name ??
                      `Department #${project.departmentId}`)
                    : null
                }
              />
              <ReadRow label="Start date" value={formatMonthYear(project.startDate)} />
              <ReadRow label="Target end date" value={formatMonthYear(project.targetEndDate)} />
              <ReadRow label="Created" value={formatMonthYear(project.createdAt)} />
            </dl>
          )}

          {isManager && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-yz-neutral-200 pt-3">
              <label htmlFor="projectStatusChoice" className="sr-only">
                Change status
              </label>
              <select
                id="projectStatusChoice"
                value={statusChoice}
                onChange={(event) => setStatusChoice(event.target.value as ProjectStatus)}
                className="h-8 rounded-sm border border-yz-neutral-300 bg-yz-panel px-2.5 text-[12.5px] text-yz-ink outline-none focus:border-yz-ink"
              >
                <option value="">Change status…</option>
                {PROJECT_STATUSES.filter((s) => s !== project.status).map((s) => (
                  <option key={s} value={s}>
                    {projectStatusLabel(s)}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={!statusChoice} onClick={() => void changeStatus()}>
                Apply
              </Button>

              <Button size="sm" variant={project.archivedAt ? "primary" : "danger"} onClick={() => void toggleArchive()}>
                {project.archivedAt ? "Restore from archive" : "Archive"}
              </Button>
            </div>
          )}
        </PanelGroup>
      </Panel>

      <Panel>
        <PanelGroup title={`Contributors (${members.length})`}>
          {members.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No contributors yet.</p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {members.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[13px] font-semibold text-yz-ink">{member.name}</span>
                  {isManager && (
                    <Button size="sm" variant="danger" onClick={() => void removeMember(member)}>
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isManager && eligibleNewMembers.length > 0 && (
            <div className="mt-3 flex items-center gap-2 border-t border-yz-neutral-200 pt-3">
              <label htmlFor="newProjectMember" className="sr-only">
                Add a contributor
              </label>
              <select
                id="newProjectMember"
                value={newMemberId}
                onChange={(event) => setNewMemberId(event.target.value)}
                className="h-8 flex-1 rounded-sm border border-yz-neutral-300 bg-yz-panel px-2.5 text-[12.5px] text-yz-ink outline-none focus:border-yz-ink sm:flex-none"
              >
                <option value="">Add a contributor…</option>
                {eligibleNewMembers.map((entry) => (
                  <option key={entry.profileId} value={entry.profileId ?? ""}>
                    {entry.fullName ?? entry.email}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={!newMemberId} onClick={() => void addMember()}>
                Add
              </Button>
            </div>
          )}
        </PanelGroup>
      </Panel>

      <Panel>
        <PanelGroup title={`Outcomes (${outcomes.length})`}>
          {outcomes.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No outcomes recorded yet.</p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {outcomes.map((outcome) => (
                <li key={outcome.id} className="py-2.5">
                  <PanelRow
                    label={outcome.title}
                    description={
                      outcome.targetDate ? `Target ${formatShortDate(outcome.targetDate)}` : undefined
                    }
                    trailing={
                      isManager ? (
                        <select
                          value={outcome.status}
                          onChange={(event) =>
                            void changeOutcomeStatus(outcome, event.target.value as OutcomeStatus)
                          }
                          className="h-8 rounded-sm border border-yz-neutral-300 bg-yz-panel px-2 text-[12px] text-yz-ink outline-none focus:border-yz-ink"
                        >
                          {OUTCOME_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {outcomeStatusLabel(s)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <StatusPill tone={outcome.status === "done" ? "ok" : "muted"}>
                          {outcomeStatusLabel(outcome.status)}
                        </StatusPill>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          {isManager && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void addOutcome();
              }}
              className="mt-3 flex flex-wrap items-end gap-2 border-t border-yz-neutral-200 pt-3"
            >
              <div className="min-w-[12rem] flex-1">
                <TextField
                  id="newOutcomeTitle"
                  label="New outcome"
                  value={outcomeForm.title}
                  error={outcomeErrors.title}
                  onChange={(event) => setOutcomeForm({ ...outcomeForm, title: event.target.value })}
                />
              </div>
              <div>
                <TextField
                  id="newOutcomeTarget"
                  label="Target date"
                  type="date"
                  hint="Optional."
                  value={outcomeForm.targetDate}
                  error={outcomeErrors.targetDate}
                  onChange={(event) =>
                    setOutcomeForm({ ...outcomeForm, targetDate: event.target.value })
                  }
                />
              </div>
              <Button type="submit" size="sm" disabled={!outcomeForm.title.trim()}>
                Add outcome
              </Button>
            </form>
          )}
        </PanelGroup>
      </Panel>

      <Panel>
        <PanelGroup
          title={`Work (${work.length})`}
          trailing={
            <Link
              href={`/work/new?organisationId=${organisationId}&projectId=${projectId}`}
              className="text-[12px] font-bold text-yz-accent underline-offset-4 hover:underline"
            >
              + New Work
            </Link>
          }
        >
          {work.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No Work linked to this project yet.</p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {work.map((item) => {
                const overdue =
                  item.dueAt !== null &&
                  item.status !== "done" &&
                  item.status !== "cancelled" &&
                  // eslint-disable-next-line react-hooks/purity
                  new Date(item.dueAt).getTime() < Date.now();

                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/work/${item.id}`}
                        className="block truncate text-[13.5px] font-semibold text-yz-ink hover:underline"
                      >
                        {item.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-yz-neutral-600">
                        <WorkStatusPill status={item.status} />
                        <span>{memberName(item.activeAssigneeProfileId)}</span>
                        <WorkProgress value={item.progress} />
                        <span className={overdue ? "text-yz-danger-ink" : undefined}>
                          Due {formatShortDate(item.dueAt) ?? "—"}
                        </span>
                      </div>
                    </div>

                    {isManager && (
                      <Button size="sm" onClick={() => void unlinkWork(item)}>
                        Unlink
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {isManager && unlinkedWork.length > 0 && (
            <div className="mt-3 flex items-center gap-2 border-t border-yz-neutral-200 pt-3">
              <label htmlFor="linkExistingWork" className="sr-only">
                Link existing work
              </label>
              <select
                id="linkExistingWork"
                value={linkWorkId}
                onChange={(event) => setLinkWorkId(event.target.value)}
                className="h-8 flex-1 rounded-sm border border-yz-neutral-300 bg-yz-panel px-2.5 text-[12.5px] text-yz-ink outline-none focus:border-yz-ink sm:flex-none"
              >
                <option value="">Link existing work…</option>
                {unlinkedWork.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={!linkWorkId} onClick={() => void linkWork()}>
                Link
              </Button>
            </div>
          )}
        </PanelGroup>
      </Panel>

      <Panel>
        <PanelGroup title="History">
          {events.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-600">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((event: ProjectEvent) => (
                <li key={event.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-yz-neutral-700">{event.message}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-yz-neutral-500">
                    {formatRelativeDay(event.createdAt)}
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
