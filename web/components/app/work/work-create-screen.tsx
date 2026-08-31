"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  fetchOrganisationPeople,
  fetchParticipation,
  type Member,
  type Participation,
} from "@/lib/organisation";
import { createWorkItem } from "@/lib/work";
import { useProfile } from "../profile/profile-provider";
import { AssigneeSelect } from "./assignee-select";

const EMPTY = {
  title: "",
  description: "",
  expectedOutput: "",
  dueAt: "",
  assigneeProfileId: "",
};

/**
 * Creating a standalone Work Item. W0 has no project/tender/contract for
 * this to belong to — it only needs an organisation, so both people can be
 * confirmed as active members of the same one, and a person to hand it to.
 */
export function WorkCreateScreen() {
  const router = useRouter();
  const { profile } = useProfile();

  const [organisations, setOrganisations] = useState<Participation[] | null>(
    null,
  );
  const [organisationId, setOrganisationId] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
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
  }, []);

  useEffect(() => {
    if (organisationId === null) {
      // Resetting to the empty selection when the organisation is cleared,
      // not reacting to data fetched from an external system.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMembers([]);
      return;
    }

    async function loadMembers(id: number) {
      try {
        const { members: next } = await fetchOrganisationPeople(id);
        setMembers(next);
      } catch {
        setMembers([]);
      }
    }

    void loadMembers(organisationId);
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

    try {
      const { workItem } = await createWorkItem({
        organisationId,
        title: form.title,
        description: form.description || null,
        expectedOutput: form.expectedOutput || null,
        dueAt: form.dueAt || null,
        assigneeProfileId: Number(form.assigneeProfileId),
      });

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
