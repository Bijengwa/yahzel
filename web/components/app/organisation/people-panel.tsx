"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import {
  describeStanding,
  fetchOrganisationPeople,
  invitePerson,
  removePerson,
  type Member,
} from "@/lib/organisation";
import { Avatar } from "../profile/avatar";
import { StandingPills } from "./standing-pills";

type Status = { tone: "ok" | "error"; message: string } | null;

const EMPTY_INVITE = { email: "", title: "", systemRole: "member" };

/**
 * The people of an organisation, and the only way somebody joins one.
 *
 * Membership is asked for here rather than from a task: work belongs to the
 * organisation's record of what it has done, so who belongs to it has to stay
 * the organisation's own decision.
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
  const [members, setMembers] = useState<Member[] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [inviting, setInviting] = useState(false);
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState(EMPTY_INVITE);
  const [busyMember, setBusyMember] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const { members: next } = await fetchOrganisationPeople(organisationId);

      setMembers(next);
    } catch (caught) {
      setStatus({
        tone: "error",
        message:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Please try again.",
      });
    }
  }, [organisationId]);

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
        email: invite.email,
        title: invite.title || null,
        systemRole: invite.systemRole,
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
        setStatus({
          tone: "error",
          message: "Something went wrong. Please try again.",
        });
      }
    } finally {
      setInviting(false);
    }
  }

  async function drop(member: Member) {
    setBusyMember(member.id);
    setStatus(null);

    try {
      const { message } = await removePerson(organisationId, member.id);

      setStatus({ tone: "ok", message });
      await load();
    } catch (caught) {
      setStatus({
        tone: "error",
        message:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Please try again.",
      });
    } finally {
      setBusyMember(null);
    }
  }

  return (
    <PanelGroup
      title="People"
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
              id="inviteEmail"
              type="email"
              label="Email address"
              autoComplete="off"
              value={invite.email}
              error={errors.email}
              onChange={(event) =>
                setInvite((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />

            <TextField
              id="inviteTitle"
              label="Their title"
              placeholder="Operations Manager"
              hint="Optional, and in the organisation's own words."
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

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
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

      {members === null ? (
        <p className="text-[13px] text-yz-neutral-600">Loading…</p>
      ) : (
        <ul className="divide-y divide-yz-neutral-200">
          {members.map((member) => (
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
                    {member.username ? `@${member.username} · ` : ""}
                    {describeStanding(member)}
                  </span>
                </span>
              </span>

              <span className="flex items-center gap-2">
                <StandingPills membership={member} />

                {canAdminister &&
                  !member.isHead &&
                  member.id !== currentMemberId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyMember === member.id}
                      onClick={() => void drop(member)}
                    >
                      {member.status === "invited" ? "Withdraw" : "Remove"}
                    </Button>
                  )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelGroup>
  );
}
