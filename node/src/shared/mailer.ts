/**
 * Outbound email.
 *
 * Yahzel has no mail provider wired up yet — the verification OTP is printed
 * to the API log and read from there in development. This keeps that single
 * arrangement rather than introducing a second one: every message Yahzel
 * sends goes through `sendMail`, and today the transport writes it to the
 * console. Swapping in a real provider later is a change to this file alone.
 */

export type MailMessage = {
  to: string;
  subject: string;
  body: string;
};

/** Where the browser lives, for links inside an email. */
export function appUrl(path = ""): string {
  const base = process.env.APP_URL || "http://localhost:3000";

  return `${base.replace(/\/$/, "")}${path}`;
}

export async function sendMail(message: MailMessage): Promise<void> {
  console.log("");
  console.log("======================================");
  console.log("YAHZEL EMAIL");
  console.log(`To: ${message.to}`);
  console.log(`Subject: ${message.subject}`);
  console.log("--------------------------------------");
  console.log(message.body);
  console.log("======================================");
  console.log("");
}
