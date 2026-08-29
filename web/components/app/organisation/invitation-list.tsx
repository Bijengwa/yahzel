"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  acceptInvitation,
  declineInvitation,
  describeInviter,
  type Invitation,
} from "@/lib/organisation";
import { ApiError } from "@/lib/api";

/**
 * The invitations waiting for the signed-in person.
 *
 * The wording keeps Yahzel's words apart: "Admin" is the inviter's access
 * role, the title is the organisation's own, and the class is where the
 * person would sit — none of the three stands in for another.
 */
export function InvitationList({
  invitations,
  onAnswered,
}: {
  invitations: Invitation[];
  onAnswered: (message: string) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(invitation: Invitation, accept: boolean) {
    setBusy(invitation.id);
    setError(null);

    try {
      const { message } = accept
        ? await acceptInvitation(invitation.id)
        : await declineInvitation(invitation.id);

      onAnswered(message);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && <p className="mb-2 text-[12px] text-yz-danger-ink">{error}</p>}

      <ul className="divide-y divide-yz-neutral-200">
        {invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-yz-ink">
                {invitation.organisation.name}
              </p>

              <p className="mt-0.5 text-[12px] leading-5 text-yz-neutral-600">
                {describeInviter(invitation)} invited you to join
                {invitation.title ? ` as ${invitation.title}` : ""} ·{" "}
                {invitation.participationLabel} ·{" "}
                {invitation.organisationClassLabel}
              </p>
            </div>

            <span className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === invitation.id}
                onClick={() => void answer(invitation, false)}
              >
                Decline
              </Button>

              <Button
                size="sm"
                variant="primary"
                disabled={busy === invitation.id}
                onClick={() => void answer(invitation, true)}
              >
                {busy === invitation.id ? "Working…" : "Accept"}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
