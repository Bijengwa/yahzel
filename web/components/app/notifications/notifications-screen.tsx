"use client";

import { useCallback, useEffect, useState } from "react";

import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchMyInvitations, type Invitation } from "@/lib/organisation";
import type { YzNotification } from "@/lib/notifications";
import { useNotifications } from "./notifications-provider";
import { InvitationNotificationItem } from "./invitation-notification-item";
import { NotificationItem } from "./notification-item";

const INVITATION_TYPE = "organisation.invited";

/**
 * The dedicated /notifications page: invitations you can still act on above
 * everything else, both read straight from NotificationsProvider so the
 * bell badge and this list can never disagree about what is unread.
 *
 * Invitations are fetched separately because a notification never carries
 * live invitation status — matching by invitationId against the currently
 * pending set is what tells an actionable invite apart from one already
 * resolved elsewhere.
 */
export function NotificationsScreen() {
  const { notifications, unreadCount, loading, markRead, markAllRead } =
    useNotifications();

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    try {
      const { invitations: next } = await fetchMyInvitations();
      setInvitations(next);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not load your invitations. Please try again.",
      );
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInvitations();
  }, [loadInvitations]);

  const invitationNotifications = notifications.filter(
    (item) => item.type === INVITATION_TYPE,
  );

  const otherNotifications = notifications.filter(
    (item) => item.type !== INVITATION_TYPE,
  );

  function handleOpenOther(notification: YzNotification) {
    void markRead(notification.id);
  }

  function handleAnswered(notification: YzNotification, invitationId: number) {
    void markRead(notification.id);
    setInvitations((current) => current.filter((item) => item.id !== invitationId));
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Notifications"
        actions={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
            >
              Mark all read
            </button>
          ) : undefined
        }
      />

      {error && <StatusMessage tone="error">{error}</StatusMessage>}

      <Panel>
        <PanelGroup title="INVITATIONS">
          {loading ? (
            <p className="text-[13px] text-yz-neutral-600">Loading…</p>
          ) : invitationNotifications.length === 0 ? (
            <p className="text-[13px] leading-6 text-yz-neutral-600">
              No pending invitations.
            </p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {invitationNotifications.map((notification) => (
                <li key={notification.id}>
                  <InvitationNotificationItem
                    notification={notification}
                    invitation={invitations.find(
                      (item) => item.id === notification.invitationId,
                    )}
                    onAnswered={(invitationId) =>
                      handleAnswered(notification, invitationId)
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>

        <PanelGroup title="OTHER">
          {loading ? (
            <p className="text-[13px] text-yz-neutral-600">Loading…</p>
          ) : otherNotifications.length === 0 ? (
            <p className="text-[13px] leading-6 text-yz-neutral-600">
              No other notifications.
            </p>
          ) : (
            <ul className="divide-y divide-yz-neutral-200">
              {otherNotifications.map((notification) => (
                <li key={notification.id}>
                  <NotificationItem
                    notification={notification}
                    onOpen={handleOpenOther}
                  />
                </li>
              ))}
            </ul>
          )}
        </PanelGroup>
      </Panel>
    </div>
  );
}
