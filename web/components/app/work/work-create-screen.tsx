"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import {
  PageHeader,
  Panel,
  PanelGroup,
  StatusMessage,
} from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchDepartments, type DepartmentSummary } from "@/lib/departments";
import {
  fetchOrganisationPeople,
  fetchParticipation,
  type Member,
  type Participation,
} from "@/lib/organisation";
import { fetchProjects, type Project } from "@/lib/projects";
import {
  createWorkItem,
  fetchWorkItem,
  fetchWorkItems,
  type CreateWorkInput,
  type WorkItemSummary,
} from "@/lib/work";
import { useProfile } from "../profile/profile-provider";
import { AssigneeSelect } from "./assignee-select";

const EMPTY = {
  title: "",
  description: "",
  expectedOutput: "",
  dueAt: "",
  assigneeProfileId: "",
  projectId: "",
  departmentId: "",
  parentId: "",
};

/**
 * Creating a Work Item. Beyond the essentials — an organisation, a person to
 * hand it to, and what "done" looks like — Phase 2 lets it optionally hang off
 * a project, be scoped to a department, or sit under a top-level parent as
 * child work. All three links are genuinely optional: plain operational work
 * with none of them set is the common case and must work perfectly.
 */
export function WorkCreateScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parentParam = searchParams.get("parentId");
  const { profile } = useProfile();

  const [organisations, setOrganisations] = useState<Participation[] | null>(
    null,
  );
  const [organisationId, setOrganisationId] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [parents, setParents] = useState<WorkItemSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { participation } = await fetchParticipation();
        const active = participation.filter(
          (entry) => entry.membership.status === "active",
        );

        setOrganisations(active);

        // A parent passed in the URL ("+ Add child work") fixes both the
        // organisation and the parent, so the child lands in the right place.
        if (parentParam) {
          const parentId = Number(parentParam);

          if (Number.isInteger(parentId) && parentId > 0) {
            try {
              const { workItem } = await fetchWorkItem(parentId);
              setOrganisationId(workItem.organisationId);

              setForm((current) => ({
                ...current,
                parentId: String(workItem.id),
              }));
              return;
            } catch {
              // Fall through to the normal single-org default below.
            }
          }
        }

        if (active.length === 1 && active[0]) {
          setOrganisationId(active[0].organisation.id);
        }
      } catch (caught) {
        setLoadError(
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Please try again.",
        );
      }
    }

    void load();
  }, [parentParam]);

  useEffect(() => {
    if (organisationId === null) {
      // Resetting to the empty selection when the organisation is cleared,
      // not reacting to data fetched from an external system.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMembers([]);

      setProjects([]);

      setDepartments([]);

      setParents([]);
      return;
    }

    async function loadScope(id: number) {
      const [people, projectList, departmentList, workItems] =
        await Promise.all([
          fetchOrganisationPeople(id).catch(() => ({ members: [] as Member[] })),
          fetchProjects(id).catch(() => ({ projects: [] as Project[] })),
          fetchDepartments(id).catch(() => ({
            departments: [] as DepartmentSummary[],
          })),
          fetchWorkItems().catch(() => ({
            workItems: [] as WorkItemSummary[],
          })),
        ]);

      setMembers(people.members);
      setProjects(projectList.projects);
      setDepartments(departmentList.departments);
      // Only top-level items of this organisation can be a parent — the
      // backend enforces the single level, but there is no point offering
      // child items as candidates.
      setParents(
        workItems.workItems.filter(
          (item) => item.organisationId === id && item.parentId === null,
        ),
      );
    }

    void loadScope(organisationId);
  }, [organisationId]);

  function update(key: keyof typeof EMPTY, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setMessage(null);
  }

  async function submit() {
    if (!organisationId) {
      setMessage("Choose an organisation first.");
      return;
    }

    setSaving(true);
    setErrors({});
    setMessage(null);

    const input: CreateWorkInput = {
      organisationId,
      title: form.title,
      description: form.description || null,
      expectedOutput: form.expectedOutput || null,
      dueAt: form.dueAt || null,
      assigneeProfileId: Number(form.assigneeProfileId),
    };

    if (form.projectId) {
      input.projectId = Number(form.projectId);
    }

    if (form.departmentId) {
      input.departmentId = Number(form.departmentId);
    }

    if (form.parentId) {
      input.parentId = Number(form.parentId);
    }

    try {
      const { workItem } = await createWorkItem(input);

      router.push(`/work/${workItem.id}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.byField());
        setMessage(caught.errors.length === 0 ? caught.message : null);
      } else {
        setMessage("Something went wrong. Please try again.");
      }

      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="New Work"
        description="Assign this to yourself or to someone in your organisation."
        actions={
          <Link
            href="/work"
            className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
          >
            Back
          </Link>
        }
      />

      {loadError && <StatusMessage tone="error">{loadError}</StatusMessage>}
      {message && <StatusMessage tone="error">{message}</StatusMessage>}

      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <PanelGroup title="Details">
            <div className="grid max-w-xl gap-3">
              {organisations && organisations.length > 1 && (
                <SelectField
                  id="workOrganisation"
                  label="Organisation"
                  value={organisationId ?? ""}
                  onChange={(event) =>
                    setOrganisationId(Number(event.target.value) || null)
                  }
                >
                  <option value="">Choose an organisation</option>

                  {organisations.map((entry) => (
                    <option
                      key={entry.organisation.id}
                      value={entry.organisation.id}
                    >
                      {entry.organisation.name}
                    </option>
                  ))}
                </SelectField>
              )}

              <TextField
                id="workTitle"
                label="Title"
                value={form.title}
                error={errors.title}
                onChange={(event) => update("title", event.target.value)}
              />

              <TextAreaField
                id="workDescription"
                label="Description"
                hint="Optional. What this Work is about."
                value={form.description}
                error={errors.description}
                onChange={(event) => update("description", event.target.value)}
              />

              <TextAreaField
                id="workExpectedOutput"
                label="Expected output"
                hint="Optional. What finishing this looks like."
                value={form.expectedOutput}
                error={errors.expectedOutput}
                onChange={(event) =>
                  update("expectedOutput", event.target.value)
                }
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  id="workDueAt"
                  label="Due date"
                  type="date"
                  hint="Optional."
                  value={form.dueAt}
                  error={errors.dueAt}
                  onChange={(event) => update("dueAt", event.target.value)}
                />

                <AssigneeSelect
                  id="workAssignee"
                  label="Assignee"
                  members={members}
                  value={form.assigneeProfileId}
                  error={errors.assigneeProfileId}
                  hint={
                    organisationId ? undefined : "Choose an organisation first."
                  }
                  currentProfileId={profile?.id ?? null}
                  onChange={(value) => update("assigneeProfileId", value)}
                />
              </div>
            </div>
          </PanelGroup>

          <PanelGroup title="Links">
            <p className="mb-3 text-[12px] leading-5 text-yz-neutral-600">
              All optional. Leave these blank for plain, standalone work.
            </p>

            <div className="grid max-w-xl gap-3 sm:grid-cols-2">
              <SelectField
                id="workProject"
                label="Project"
                value={form.projectId}
                error={errors.projectId}
                hint={
                  projects.length === 0
                    ? "No projects in this organisation yet."
                    : undefined
                }
                onChange={(event) => update("projectId", event.target.value)}
              >
                <option value="">— none —</option>

                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </SelectField>

              <SelectField
                id="workDepartment"
                label="Department scope"
                value={form.departmentId}
                error={errors.departmentId}
                hint={
                  departments.length === 0
                    ? "No departments in this organisation yet."
                    : undefined
                }
                onChange={(event) => update("departmentId", event.target.value)}
              >
                <option value="">— none —</option>

                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </SelectField>

              <SelectField
                id="workParent"
                label="Parent work"
                value={form.parentId}
                error={errors.parentId}
                hint="Optional. Makes this a child of an existing top-level item."
                onChange={(event) => update("parentId", event.target.value)}
              >
                <option value="">— none —</option>

                {parents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.title}
                  </option>
                ))}
              </SelectField>
            </div>
          </PanelGroup>

          <div className="flex items-center gap-2 py-4">
            <Button
              type="submit"
              variant="primary"
              disabled={saving || !organisationId}
            >
              {saving ? "Creating…" : "Create Work"}
            </Button>

            <Link
              href="/work"
              className="px-3 py-1.5 text-[12px] font-bold text-yz-neutral-700 hover:text-yz-ink"
            >
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}
