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
import { fetchOrganisationPeople, type Member } from "@/lib/organisation";
import { createProject, type CreateProjectInput } from "@/lib/projects";
import { AssigneeSelect } from "../work/assignee-select";
import { useProfile } from "../profile/profile-provider";
import { useProjectOrganisation } from "./use-project-organisation";

const EMPTY = {
  name: "",
  description: "",
  ownerProfileId: "",
  departmentId: "",
  startDate: "",
  targetEndDate: "",
};

/**
 * Creating a Project. Beyond a name, everything here is optional — an owner
 * defaults to whoever creates it, exactly like Work defaults its creator as
 * the natural starting accountable person.
 */
export function ProjectCreateScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialOrg = Number(searchParams.get("organisationId")) || null;
  const { profile } = useProfile();

  const { organisations, organisationId, setOrganisationId } =
    useProjectOrganisation(initialOrg);

  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (organisationId === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMembers([]);
      setDepartments([]);
      return;
    }

    async function loadScope(id: number) {
      try {
        const [people, departmentList] = await Promise.all([
          fetchOrganisationPeople(id).catch(() => ({ members: [] as Member[] })),
          fetchDepartments(id).catch(() => ({
            departments: [] as DepartmentSummary[],
          })),
        ]);

        setMembers(people.members);
        setDepartments(departmentList.departments);
      } catch (caught) {
        setLoadError(
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Please try again.",
        );
      }
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

    const input: CreateProjectInput = {
      name: form.name,
      description: form.description || null,
    };

    if (form.ownerProfileId) {
      input.ownerProfileId = Number(form.ownerProfileId);
    }

    if (form.departmentId) {
      input.departmentId = Number(form.departmentId);
    }

    if (form.startDate) {
      input.startDate = form.startDate;
    }

    if (form.targetEndDate) {
      input.targetEndDate = form.targetEndDate;
    }

    try {
      const { project } = await createProject(organisationId, input);

      router.push(`/projects/${project.id}?organisationId=${organisationId}`);
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
        title="New Project"
        description="A coordination layer over the Work it contains — you can add contributors and outcomes afterward."
        actions={
          <Link
            href="/projects"
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
                  id="projectOrganisation"
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
                id="projectName"
                label="Name"
                value={form.name}
                error={errors.name}
                onChange={(event) => update("name", event.target.value)}
              />

              <TextAreaField
                id="projectDescription"
                label="Description"
                hint="Optional. What this Project is about."
                value={form.description}
                error={errors.description}
                onChange={(event) => update("description", event.target.value)}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  id="projectStartDate"
                  label="Start date"
                  type="date"
                  hint="Optional."
                  value={form.startDate}
                  error={errors.startDate}
                  onChange={(event) => update("startDate", event.target.value)}
                />

                <TextField
                  id="projectTargetEndDate"
                  label="Target end date"
                  type="date"
                  hint="Optional."
                  value={form.targetEndDate}
                  error={errors.targetEndDate}
                  onChange={(event) => update("targetEndDate", event.target.value)}
                />
              </div>
            </div>
          </PanelGroup>

          <PanelGroup title="Responsibility">
            <div className="grid max-w-xl gap-3 sm:grid-cols-2">
              <AssigneeSelect
                id="projectOwner"
                label="Owner"
                members={members}
                value={form.ownerProfileId}
                error={errors.ownerProfileId}
                hint={
                  organisationId
                    ? "Optional. Defaults to you."
                    : "Choose an organisation first."
                }
                currentProfileId={profile?.id ?? null}
                onChange={(value) => update("ownerProfileId", value)}
              />

              <SelectField
                id="projectDepartment"
                label="Department scope"
                value={form.departmentId}
                error={errors.departmentId}
                hint={
                  departments.length === 0
                    ? "No departments in this organisation yet."
                    : "Optional."
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
            </div>
          </PanelGroup>

          <div className="flex items-center gap-2 py-4">
            <Button type="submit" variant="primary" disabled={saving || !organisationId}>
              {saving ? "Creating…" : "Create Project"}
            </Button>

            <Link
              href="/projects"
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
