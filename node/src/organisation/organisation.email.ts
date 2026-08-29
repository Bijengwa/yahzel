import { appUrl, sendMail } from "../shared/mailer.js";
import {
  organisationClassLabel,
  participationTypeLabel,
} from "./organisation.types.js";

/**
 * The one message an invitation sends. It has to work for somebody who has
 * never heard of Yahzel, so it says who invited them, from where, as what,
 * and exactly what happens next — the invitation waits for them, and is
 * neither accepted nor refused by registering.
 */
export type InvitationEmailInput = {
  to: string;
  organisationName: string;
  inviterName: string;
  /** The inviter's Yahzel access role: "admin" or "member". */
  inviterSystemRole: string;
  /** The inviter's own title in that organisation, if they have one. */
  inviterTitle: string | null;
  title: string | null;
  participationType: string;
  organisationClass: string;
  /** True when the address already belongs to a Yahzel account. */
  registered: boolean;
};

function describeInviter(input: InvitationEmailInput): string {
  const standing = [
    input.inviterTitle,
    input.inviterSystemRole === "admin" ? "Admin" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return standing ? `${input.inviterName} (${standing})` : input.inviterName;
}

export function composeInvitationEmail(input: InvitationEmailInput) {
  const asWhat = input.title
    ? ` as ${input.title}`
    : ` as a ${organisationClassLabel(input.organisationClass).toLowerCase()}`;

  const link = input.registered
    ? appUrl("/organisation")
    : appUrl(`/auth/register?email=${encodeURIComponent(input.to)}`);

  const lines = [
    `${describeInviter(input)} from ${input.organisationName} has invited you to join${asWhat} on Yahzel.`,
    "",
    `Organisation: ${input.organisationName}`,
    `Proposed title: ${input.title ?? "Not set"}`,
    `Participation: ${participationTypeLabel(input.participationType)}`,
    `Organisation class: ${organisationClassLabel(input.organisationClass)}`,
    "",
    input.registered
      ? "Open Yahzel and go to Organisation to accept or decline it:"
      : "Create your Yahzel account with this email address, and the invitation will be waiting for you inside Yahzel. Registering does not accept it — you decide afterwards:",
    link,
    "",
    "If you were not expecting this, you can ignore this message.",
  ];

  return {
    to: input.to,
    subject: `${input.organisationName} invited you to join on Yahzel`,
    body: lines.join("\n"),
  };
}

/**
 * Sending must never fail the invitation itself: the row is the invitation,
 * and the person can still find it inside Yahzel if the message never left.
 */
export async function sendInvitationEmail(
  input: InvitationEmailInput,
): Promise<void> {
  try {
    await sendMail(composeInvitationEmail(input));
  } catch (error) {
    console.error("Failed to send an organisation invitation email:", error);
  }
}
