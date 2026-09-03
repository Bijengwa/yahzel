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
  workItemId?: number | null;
  actionUrl?: string | null;
}): Promise<NotificationRecord> {
  const [row] = await db<NotificationRecord>(NOTIFICATIONS)
    .insert({
      recipient_profile_id: input.recipientProfileId,
      type: input.type,
      message: input.message,
      organisation_id: input.organisationId ?? null,
      invitation_id: input.invitationId ?? null,
      work_item_id: input.workItemId ?? null,
      action_url: input.actionUrl ?? null,
    })
    .returning("*");

  if (!row) {
    throw new Error("The notification row was not returned after insert.");
  }

  return row;
}

/**
 * Whether this exact event was already recorded for this person very
 * recently — the same recipient, type, and the same organisation/work-item/
 * invitation it points at. Guards against a caller accidentally firing the
 * same notification twice (a double-submit, a retried request) without
 * suppressing two genuinely distinct notifications of the same type (e.g.
 * two different overdue Work items, which carry different work_item_id).
 */
export async function findRecentDuplicate(
  input: {
    recipientProfileId: number;
    type: string;
    organisationId?: number | null;
    invitationId?: number | null;
    workItemId?: number | null;
  },
  withinSeconds = 60,
): Promise<NotificationRecord | undefined> {
  return db<NotificationRecord>(NOTIFICATIONS)
    .where({
      recipient_profile_id: input.recipientProfileId,
      type: input.type,
      organisation_id: input.organisationId ?? null,
      invitation_id: input.invitationId ?? null,
      work_item_id: input.workItemId ?? null,
    })
    .where("created_at", ">=", db.raw(`now() - interval '${withinSeconds} seconds'`))
    .orderBy("created_at", "desc")
    .first();
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

/** Scoped by recipient, same as markRead — nobody can delete another person's notification. */
export async function deleteNotification(
  id: number,
  recipientProfileId: number,
): Promise<boolean> {
  const deleted = await db(NOTIFICATIONS)
    .where({ id, recipient_profile_id: recipientProfileId })
    .del();

  return deleted > 0;
}
