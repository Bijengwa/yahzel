/**
 * The one row behind every notification in Yahzel, mirroring migration 007.
 *
 * A notification never copies the data of the thing it is about — it only
 * references an organisation or an invitation by id, and carries a message
 * already rendered into a sentence ("Datius invited you to join Musabe
 * Schools.") so nothing downstream has to reassemble it from a template.
 */

export const NOTIFICATIONS_TABLE = "notifications";

export type NotificationRecord = {
  id: number;
  recipient_profile_id: number;

  /** A dotted event name, e.g. "organisation.invited". */
  type: string;

  message: string;

  organisation_id: number | null;
  invitation_id: number | null;

  /** Where opening the notification should take the person, if anywhere. */
  action_url: string | null;

  /** Null while unread. */
  read_at: string | null;

  created_at: string;
};
