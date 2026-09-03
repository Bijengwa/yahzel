import { db } from "../src/db/knex.js";
import { createNotification } from "../src/notifications/notification.service.js";

/**
 * End-to-end check of notification gaps closed for V1 completion
 * (Priority 5): dedup, delete, and the new position-assignment
 * notification. Drives the running API over HTTP for the HTTP-facing
 * parts, and calls createNotification directly for the dedup guard
 * (no existing endpoint fires the exact same event twice — most flows
 * already prevent the underlying duplicate action itself).
 *
 * Start the API first:  npm run dev
 */

const API = process.env.CHECK_API_URL ?? "http://localhost:5000";
let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) failures += 1;
  console.log(
    `${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : `  -> ${JSON.stringify(detail)}`}`,
  );
}

async function call(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, options);
  const body = await res.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: body as any };
}

function json(method: string, token: string | null, payload?: unknown): RequestInit {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  };
}

async function makeUser(fullName: string, email: string) {
  const reg = await call(
    "/api/auth/register",
    json("POST", null, { fullName, email, password: "password123", confirmPassword: "password123" }),
  );
  const id = reg.body.user.id as number;
  const row = await db("profiles").where({ id }).first();
  const verified = await call("/api/auth/verify", json("POST", null, { userId: id, otp: row.verification_otp }));
  return { id, fullName, email, token: verified.body.token as string };
}

const stamp = Date.now();

const founder = await makeUser("Notif Founder", `notif-founder${stamp}@example.com`);
const member = await makeUser("Notif Member", `notif-member${stamp}@example.com`);

let r = await call("/api/organisations", json("POST", founder.token, { name: `Notif Org ${stamp}`, type: "company" }));
const orgId = r.body.organisation.id as number;

r = await call("/api/organisations", json("POST", founder.token, { name: `Notif Org B ${stamp}`, type: "company" }));
const orgIdB = r.body.organisation.id as number;

/* ------------------------------------------------------------------- dedup */

await createNotification({
  recipientProfileId: member.id,
  type: "test.dedup",
  message: "First.",
  organisationId: orgId,
});
await createNotification({
  recipientProfileId: member.id,
  type: "test.dedup",
  message: "Second (should be suppressed).",
  organisationId: orgId,
});

const dedupRows = await db("notifications").where({
  recipient_profile_id: member.id,
  type: "test.dedup",
});
check("an identical notification fired twice in quick succession is only stored once", dedupRows.length === 1, dedupRows.length);

await createNotification({
  recipientProfileId: member.id,
  type: "test.dedup",
  message: "Different organisation — must not be suppressed.",
  organisationId: orgIdB,
});

const dedupRowsAfterDistinct = await db("notifications").where({
  recipient_profile_id: member.id,
  type: "test.dedup",
});
check(
  "a genuinely distinct notification of the same type is not suppressed",
  dedupRowsAfterDistinct.length === 2,
  dedupRowsAfterDistinct.length,
);

/* ------------------------------------------------------------------- delete */

r = await call("/api/notifications", json("GET", member.token));
const toDelete = r.body.notifications.find((n: { type: string }) => n.type === "test.dedup");

r = await call(`/api/notifications/${toDelete.id}`, json("DELETE", founder.token));
check("somebody else cannot delete another person's notification", r.status === 404, r.status);

r = await call(`/api/notifications/${toDelete.id}`, json("DELETE", member.token));
check("the owner can delete their own notification", r.status === 200 && r.body.deleted === true, r.body);

r = await call("/api/notifications", json("GET", member.token));
check(
  "the deleted notification no longer appears in the list",
  !r.body.notifications.some((n: { id: number }) => n.id === toDelete.id),
  r.body.notifications.length,
);

/* --------------------------------------------------- position assignment */

const invite = await call(`/api/organisations/${orgId}/invitations`, json("POST", founder.token, { person: member.email }));
await call(`/api/organisations/invitations/${invite.body.invitation.id}/accept`, json("POST", member.token));
const memberMembershipId = (await call(`/api/organisations/${orgId}`, json("GET", member.token))).body.membership.id;

r = await call(`/api/hierarchy/${orgId}/positions`, json("POST", founder.token, { name: `Notif Position ${stamp}` }));
const positionId = r.body.position.id as number;

r = await call(
  `/api/hierarchy/${orgId}/positions/${positionId}/occupant`,
  json("POST", founder.token, { memberId: memberMembershipId }),
);
check("an admin can assign the position", r.status === 200 || r.status === 201, r.body);

const positionNotifs = await db("notifications").where({
  recipient_profile_id: member.id,
  type: "hierarchy.position_assigned",
});
check("the assigned member was notified of the position assignment", positionNotifs.length === 1, positionNotifs.length);

/* ------------------------------------------------------------------- teardown */

await db("notifications")
  .where((qb) => qb.whereIn("organisation_id", [orgId, orgIdB]).orWhereIn("recipient_profile_id", [founder.id, member.id]))
  .delete();
await db("organisations").whereIn("id", [orgId, orgIdB]).delete();
await db("profiles").whereIn("id", [founder.id, member.id]).delete();

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
