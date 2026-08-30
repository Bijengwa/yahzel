"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  acceptInvitation,
  declineInvitation,
  type Invitation,
} from "@/lib/organisation";
import { describeRelativeTime, type YzNotification } from "@/lib/notifications";

type InvitationState = "pending" | "expired" | "resolved";

function invitationStanding(invitation: Invitation): string {
  return [invitation.title || invitation.participationLabel, invitation.organisationClassLabel]
    .filter(Boolean)
    .join(" · ");
}

function isExpired(invitation: Invitation | undefined): boolean {
  return !!invitation?.expiresAt && new Date(invitation.expiresAt).getTime() < Date.now();
}

/**
 * One organisation-invitation notification: the message and standing on the
 * left, Accept/Decline (or a resolved/expired label once there is nothing
 * left to answer) on the right — dense enough that a dozen fit without
 * scrolling.
 *
 * The invitation itself, not just the notification row, decides whether
 * this is still actionable: `invitation` is undefined once it has been
 * accepted, declined or withdrawn elsewhere, which is exactly what "no
 * longer valid" means here.
 */
export function InvitationNotificationItem({
  notification,
  invitation,
  onAnswered,
}: {
  notification: YzNotification;
  invitation: Invitation | undefined;
  onAnswered: (invitationId: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state: InvitationState = !invitation
    ? "resolved"
    : isExpired(invitation)
      ? "expired"
      : "pending";

  async function answer(accept: boolean) {
    if (!invitation) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (accept) {
        await acceptInvitation(invitation.id);
      } else {
        await declineInvitation(invitation.id);
      }

      onAnswered(invitation.id);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden="true"
          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
            notification.read ? "bg-transparent" : "bg-yz-accent"
          }`}
        />

        <div className="min-w-0">
          <p
            className={`text-[13px] leading-5 ${
              notification.read
                ? "text-yz-neutral-600"
                : "font-semibold text-yz-ink"
            }`}
          >
            {notification.message}
          </p>

          {invitation && (
            <p className="mt-0.5 text-[12px] leading-5 text-yz-neutral-600">
              {invitationStanding(invitation)}
            </p>
          )}

          <p className="mt-0.5 text-[11px] text-yz-neutral-500">
            {describeRelativeTime(notification.createdAt)}
          </p>

          {error && (
            <p className="mt-1 text-[12px] text-yz-danger-ink">{error}</p>
          )}
        </div>
      </div>

      <span className="flex shrink-0 items-center gap-2">
        {state === "pending" && (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void answer(false)}
            >
              Decline
            </Button>

            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => void answer(true)}
            >
              {busy ? "Working…" : "Accept"}
            </Button>
          </>
        )}

        {state === "expired" && (
          <span className="text-[12px] font-semibold text-yz-neutral-500">
            Expired
          </span>
        )}

        {state === "resolved" && (
          <span className="text-[12px] font-semibold text-yz-neutral-500">
            No longer valid
          </span>
        )}
      </span>
    </div>
  );
}
