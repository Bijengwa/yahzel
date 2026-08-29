import { db } from "../db/knex.js";
import {
  NOTIFICATIONS_TABLE,
  type NotificationRecord,
} from "./notification.record.js";

const NOTIFICATIONS = NOTIFICATIONS_TABLE;

export async function insertNotification(input: {
  recipientProfileId: number;
  type: string;
  message: string;
  organisationId?: number | null;
  invitationId?: number | null;
  actionUrl?: string | null;
}): Promise<NotificationRecord> {
  const [row] = await db<NotificationRecord>(NOTIFICATIONS)
    .insert({
      recipient_profile_id: input.recipientProfileId,
      type: input.type,
      message: input.message,
      organisation_id: input.organisationId ?? null,
      invitation_id: input.invitationId ?? null,
      action_url: input.actionUrl ?? null,
    })
    .returning("*");

  if (!row) {
    throw new Error("The notification row was not returned after insert.");
  }

  return row;
}

/** The most recent notifications for one person, newest first. */
export function listForRecipient(
  recipientProfileId: number,
  limit = 50,
): Promise<NotificationRecord[]> {
  return db<NotificationRecord>(NOTIFICATIONS)
    .where({ recipient_profile_id: recipientProfileId })
    .orderBy("created_at", "desc")
    .limit(limit);
}

export async function countUnread(recipientProfileId: number): Promise<number> {
  const [row] = await db(NOTIFICATIONS)
    .where({ recipient_profile_id: recipientProfileId })
    .whereNull("read_at")
    .count<{ count: string }[]>("* as count");

  return Number(row?.count ?? 0);
}

/**
 * Scoped by recipient on every write so nobody can mark another person's
 * notification read by guessing an id.
 */
export async function markRead(
  id: number,
  recipientProfileId: number,
): Promise<NotificationRecord | undefined> {
  const [row] = await db<NotificationRecord>(NOTIFICATIONS)
    .where({ id, recipient_profile_id: recipientProfileId })
    .update({ read_at: db.fn.now() as unknown as string })
    .returning("*");

  return row;
}

export async function markAllRead(recipientProfileId: number): Promise<number> {
  return db(NOTIFICATIONS)
    .where({ recipient_profile_id: recipientProfileId })
    .whereNull("read_at")
    .update({ read_at: db.fn.now() });
}
