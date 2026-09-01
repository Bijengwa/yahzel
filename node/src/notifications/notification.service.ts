import type { NotificationRecord } from "./notification.record.js";
import {
  countUnread,
  insertNotification,
  listForRecipient,
  markAllRead,
  markRead,
} from "./notification.repository.js";
import { publish } from "./notification.hub.js";

function publicNotification(record: NotificationRecord) {
  return {
    id: record.id,
    type: record.type,
    message: record.message,
    organisationId: record.organisation_id,
    invitationId: record.invitation_id,
    workItemId: record.work_item_id,
    actionUrl: record.action_url,
    read: record.read_at !== null,
    createdAt: record.created_at,
  };
}

export type PublicNotification = ReturnType<typeof publicNotification>;

/**
 * The one entry point every module uses to notify somebody. It writes the
 * row — the database is the source of truth — and then, if that person has
 * an open SSE connection, pushes it straight to them; if not, it will simply
 * be there next time they call GET /api/notifications.
 *
 * `recipientProfileId` must already be verified to belong to a real person;
 * this function does not check who is asking, because it is only ever
 * called from server-side code that already knows.
 */
export async function createNotification(input: {
  recipientProfileId: number;
  type: string;
  message: string;
  organisationId?: number | null;
  invitationId?: number | null;
  workItemId?: number | null;
  actionUrl?: string | null;
}): Promise<PublicNotification> {
  const row = await insertNotification(input);

  const notification = publicNotification(row);

  publish(input.recipientProfileId, "notification", notification);

  return notification;
}

export async function listMyNotifications(userId: number) {
  const [notifications, unreadCount] = await Promise.all([
    listForRecipient(userId),
    countUnread(userId),
  ]);

  return {
    notifications: notifications.map(publicNotification),
    unreadCount,
  };
}

export async function markNotificationRead(userId: number, id: number) {
  const row = await markRead(id, userId);

  return {
    notification: row ? publicNotification(row) : null,
    unreadCount: await countUnread(userId),
  };
}

export async function markAllNotificationsRead(userId: number) {
  await markAllRead(userId);

  return { unreadCount: 0 };
}
