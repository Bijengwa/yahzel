"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import {
  fetchExpiringContracts,
  type ExpiringContract,
} from "@/lib/employment";
import {
  concludeMembership,
  describeStanding,
  fetchOrganisationInvitations,
  fetchOrganisationPeople,
  invitePerson,
  updateStanding,
  withdrawInvitation,
  type Invitation,
  type Member,
  type StandingInput,
} from "@/lib/organisation";
import { Avatar } from "../profile/avatar";
import { EmploymentPanel } from "./employment-panel";
import { MembershipStatusPill } from "./organisation-card";
import { StandingPills } from "./standing-pills";
import { useOrganisationVocabulary } from "./use-organisation-types";

type Status = { tone: "ok" | "error"; message: string } | null;

const EMPTY_INVITE = {
  person: "",
  title: "",
  systemRole: "member",
  organisationClass: "member",
  participationType: "employee",
  expectedEndAt: "",
};

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

/**
 * The people of an organisation, arranged the way the organisation itself is:
 * its Administration — the Head, directors and managers — and then everybody
 * else. Membership is asked for here and nowhere else.
 */
export function PeoplePanel({
  organisationId,
  canAdminister,
  currentMemberId,
}: {
  organisationId: number;
  canAdminister: boolean;
  currentMemberId: number;
}) {
  const vocabulary = useOrganisationVocabulary();

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [status, setStatus] = useState<Status>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [inviting, setInviting] = useState(false);
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState(EMPTY_INVITE);
  const [busyMember, setBusyMember] = useState<number | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [employmentTarget, setEmploymentTarget] = useState<Member | null>(null);
  const [expiring, setExpiring] = useState<ExpiringContract[]>([]);

  const load = useCallback(async () => {
    try {
      const { members: next } = await fetchOrganisationPeople(organisationId);

      setMembers(next);
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    }

    if (!canAdminister) {
      return;
    }

    try {
      const { invitations: sent } =
        await fetchOrganisationInvitations(organisationId);

      setInvitations(sent.filter((entry) => entry.status === "pending"));
    } catch {
      // Not being able to list invitations must not hide the people.
    }

    try {
      const { expiring: list } = await fetchExpiringContracts(organisationId);

      setExpiring(list);
    } catch {
      // Not being able to load this must not hide the people list either.
    }
  }, [organisationId, canAdminister]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function send() {
    setInviting(true);
    setErrors({});
    setStatus(null);

    try {
      const { message } = await invitePerson(organisationId, {
        person: invite.person,
        title: invite.title || null,
        systemRole: invite.systemRole,
        organisationClass: invite.organisationClass,
        participationType: invite.participationType,
        expectedEndAt: invite.expectedEndAt || null,
      });

      setInvite(EMPTY_INVITE);
      setOpen(false);
      setStatus({ tone: "ok", message });
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.byField());

        if (caught.errors.length === 0) {
          setStatus({ tone: "error", message: caught.message });
        }
      } else {
        setStatus({ tone: "error", message: failureMessage(caught) });
      }
    } finally {
      setInviting(false);
    }
  }

  async function saveStanding(member: Member, patch: StandingInput) {
    setBusyMember(member.id);
    setStatus(null);

    try {
      const { message } = await updateStanding(organisationId, member.id, patch);

      setStatus({ tone: "ok", message });
      setEditing(null);
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusyMember(null);
    }
  }

  async function conclude(member: Member) {
    setBusyMember(member.id);
    setStatus(null);

    try {
      const { message } = await concludeMembership(organisationId, member.id);

      setStatus({ tone: "ok", message });
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusyMember(null);
    }
  }

  async function withdraw(invitation: Invitation) {
    setBusyMember(-invitation.id);
    setStatus(null);

    try {
      const { message } = await withdrawInvitation(
        organisationId,
        invitation.id,
      );

      setStatus({ tone: "ok", message });
      await load();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusyMember(null);
    }
  }

  function renderPerson(member: Member) {
    return (
      <li
        key={member.id}
        className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar
            fullName={member.fullName ?? member.email ?? "?"}
            src={member.profilePictureUrl}
            size={28}
          />

          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-yz-ink">
              {member.fullName ?? member.email}
            </span>

            <span className="block truncate text-[12px] text-yz-neutral-600">
              {describeStanding(member)} · {member.participationLabel}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <StandingPills membership={member} />

          {member.status !== "active" && (
            <MembershipStatusPill status={member.status} />
          )}

          {canAdminister && (
            <Link
              href={`/organisation/${organisationId}/people/${member.id}/history`}
              className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
            >
              History
            </Link>
          )}

          {canAdminister && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busyMember === member.id}
              onClick={() => setEditing(member)}
            >
              Standing
            </Button>
          )}

          {canAdminister && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busyMember === member.id}
              onClick={() => setEmploymentTarget(member)}
            >
              Employment
            </Button>
          )}

          {canAdminister &&
            member.id !== currentMemberId &&
            member.status === "active" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busyMember === member.id}
                onClick={() => void conclude(member)}
              >
                Conclude
              </Button>
            )}
        </span>
      </li>
    );
  }

  const administration = members?.filter((member) => member.isAdministration);
  const people = members?.filter((member) => !member.isAdministration);

  return (
    <>
      <PanelGroup
        title="Administration"
        trailing={
          canAdminister &&
          !open && (
            <Button size="sm" onClick={() => setOpen(true)}>
              Invite
            </Button>
          )
        }
      >
        {status && (
          <StatusMessage tone={status.tone} className="mb-3">
            {status.message}
          </StatusMessage>
        )}

        {open && (
          <form
            className="mb-4 rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 p-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                id="invitePerson"
                label="Username or email"
                placeholder="@josh or josh@example.com"
                hint="An address with no Yahzel account still works — the invitation waits for them."
                autoComplete="off"
                value={invite.person}
                error={errors.person}
                onChange={(event) =>
                  setInvite((current) => ({
                    ...current,
                    person: event.target.value,
                  }))
                }
              />

              <TextField
                id="inviteTitle"
                label="Professional title"
                placeholder="Accountant"
                hint="Free text, in the organisation's own words."
                value={invite.title}
                error={errors.title}
                onChange={(event) =>
                  setInvite((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField
                id="inviteParticipation"
                label="Participation"
                value={invite.participationType}
                error={errors.participationType}
                onChange={(event) =>
                  setInvite((current) => ({
                    ...current,
                    participationType: event.target.value,
                  }))
                }
              >
                {vocabulary.participationTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>

              <SelectField
                id="inviteClass"
                label="Organisation class"
                value={invite.organisationClass}
                error={errors.organisationClass}
                onChange={(event) =>
                  setInvite((current) => ({
                    ...current,
                    organisationClass: event.target.value,
                  }))
                }
              >
                {vocabulary.organisationClasses.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>

              <SelectField
                id="inviteRole"
                label="Yahzel access"
                hint="Admins can invite and remove people."
                value={invite.systemRole}
                error={errors.systemRole}
                onChange={(event) =>
                  setInvite((current) => ({
                    ...current,
                    systemRole: event.target.value,
                  }))
                }
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </SelectField>

              {invite.participationType === "intern" && (
                <TextField
                  id="inviteEndDate"
                  label="End date"
                  type="date"
                  hint="Required for an internship."
                  value={invite.expectedEndAt}
                  error={errors.expectedEndAt}
                  onChange={(event) =>
                    setInvite((current) => ({
                      ...current,
                      expectedEndAt: event.target.value,
                    }))
                  }
                />
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={inviting}
              >
                {inviting ? "Sending…" : "Send invitation"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                disabled={inviting}
                onClick={() => {
                  setOpen(false);
                  setInvite(EMPTY_INVITE);
                  setErrors({});
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {editing && (
          <StandingForm
            member={editing}
            classes={vocabulary.organisationClasses}
            participationTypes={vocabulary.participationTypes}
            saving={busyMember === editing.id}
            onCancel={() => setEditing(null)}
            onSave={(patch) => void saveStanding(editing, patch)}
          />
        )}

        {members === null ? (
          <p className="text-[13px] text-yz-neutral-600">Loading…</p>
        ) : administration && administration.length > 0 ? (
          <ul className="divide-y divide-yz-neutral-200">
            {administration.map(renderPerson)}
          </ul>
        ) : (
          <p className="text-[12.5px] leading-6 text-yz-neutral-600">
            Nobody is in the Administration yet.
          </p>
        )}
      </PanelGroup>

      <PanelGroup title="People">
        {members === null ? (
          <p className="text-[13px] text-yz-neutral-600">Loading…</p>
        ) : people && people.length > 0 ? (
          <ul className="divide-y divide-yz-neutral-200">
            {people.map(renderPerson)}
          </ul>
        ) : (
          <p className="text-[13px] text-yz-neutral-600">No other people yet.</p>
        )}
      </PanelGroup>

      {canAdminister && expiring.length > 0 && (
        <PanelGroup title={`Contracts to review (${expiring.length})`}>
          <ul className="divide-y divide-yz-neutral-200">
            {expiring.map((entry) => (
              <li
                key={entry.contract.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-yz-ink">
                    {entry.memberName}
                  </span>

                  <span className="block truncate text-[12px] text-yz-neutral-600">
                    {entry.contract.contractTypeLabel} —{" "}
                    {entry.daysUntilExpiry >= 0
                      ? `ends in ${entry.daysUntilExpiry} day(s)`
                      : `ended ${Math.abs(entry.daysUntilExpiry)} day(s) ago`}
                  </span>
                </span>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const member = members?.find((m) => m.id === entry.memberId);

                    if (member) {
                      setEmploymentTarget(member);
                    }
                  }}
                >
                  Review
                </Button>
              </li>
            ))}
          </ul>
        </PanelGroup>
      )}

      {canAdminister && invitations.length > 0 && (
        <PanelGroup title="Invitations sent">
          <ul className="divide-y divide-yz-neutral-200">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-yz-ink">
                    {invitation.email}
                  </span>

                  <span className="block truncate text-[12px] text-yz-neutral-600">
                    {invitation.title ?? "No title"} ·{" "}
                    {invitation.participationLabel} ·{" "}
                    {invitation.organisationClassLabel}
                  </span>
                </span>

                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyMember === -invitation.id}
                  onClick={() => void withdraw(invitation)}
                >
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
        </PanelGroup>
      )}

      {employmentTarget && (
        <EmploymentPanel
          organisationId={organisationId}
          member={employmentTarget}
          canAdminister={canAdminister}
          onClose={() => setEmploymentTarget(null)}
        />
      )}
    </>
  );
}

/**
 * Where somebody stands: their class, their title, how they take part, and
 * whether the relationship is still running. Each is its own field — none is
 * a side effect of another.
 */
function StandingForm({
  member,
  classes,
  participationTypes,
  saving,
  onCancel,
  onSave,
}: {
  member: Member;
  classes: { value: string; label: string }[];
  participationTypes: { value: string; label: string }[];
  saving: boolean;
  onCancel: () => void;
  onSave: (patch: StandingInput) => void;
}) {
  const [form, setForm] = useState({
    organisationClass: member.organisationClass,
    participationType: member.participationType,
    systemRole: member.systemRole,
    title: member.title ?? "",
    expectedEndAt: member.expectedEndAt ? member.expectedEndAt.slice(0, 10) : "",
    status: member.status,
  });

  return (
    <form
      className="mb-4 rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          ...form,
          title: form.title || null,
          expectedEndAt: form.expectedEndAt || null,
        });
      }}
    >
      <p className="mb-3 text-[12px] font-bold text-yz-neutral-600">
        {member.fullName ?? member.email}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          id="standingClass"
          label="Organisation class"
          value={form.organisationClass}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              organisationClass: event.target.value,
            }))
          }
        >
          {classes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <SelectField
          id="standingParticipation"
          label="Participation"
          value={form.participationType}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              participationType: event.target.value,
            }))
          }
        >
          {participationTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <TextField
          id="standingTitle"
          label="Professional title"
          placeholder="Operations Manager"
          value={form.title}
          onChange={(event) =>
            setForm((current) => ({ ...current, title: event.target.value }))
          }
        />

        <SelectField
          id="standingRole"
          label="Yahzel access"
          value={form.systemRole}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              systemRole: event.target.value,
            }))
          }
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </SelectField>

        <SelectField
          id="standingStatus"
          label="Status"
          value={form.status}
          onChange={(event) =>
            setForm((current) => ({ ...current, status: event.target.value }))
          }
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="concluded">Concluded</option>
        </SelectField>

        {form.participationType === "intern" && (
          <TextField
            id="standingEndDate"
            label="End date"
            type="date"
            hint="Required for an internship."
            value={form.expectedEndAt}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                expectedEndAt: event.target.value,
              }))
            }
          />
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save standing"}
        </Button>

        <Button variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
