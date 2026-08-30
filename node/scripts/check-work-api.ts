import { db } from "../src/db/knex.js";

/**
 * End-to-end check of the Work (W0) area, in the style of
 * check-organisation-api.ts: it drives the running API over HTTP with
 * throwaway accounts and organisations, and removes everything it created.
 *
 * Start the API first:  npm run dev
 */

const API = "http://localhost:5000";
let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) failures += 1;
  console.log(
    `${condition ? "PASS" : "FAIL"}  ${label}${
      condition ? "" : `  -> ${JSON.stringify(detail)}`
    }`,
  );
}

async function call(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, options);
  const body = await res.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: body as any };
}

function json(
  method: string,
  token: string | null,
  payload?: unknown,
): RequestInit {
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
    json("POST", null, {
      fullName,
      email,
      password: "password123",
      confirmPassword: "password123",
    }),
  );

  const id = reg.body.user.id as number;
  const row = await db("profiles").where({ id }).first();

  const verified = await call(
    "/api/auth/verify",
    json("POST", null, { userId: id, otp: row.verification_otp }),
  );

  return { id, email, token: verified.body.token as string };
}

async function addActiveMember(
  organisationId: number,
  adminToken: string,
  person: { id: number; email: string; token: string },
) {
  const invite = await call(
    `/api/organisations/${organisationId}/invitations`,
    json("POST", adminToken, { person: person.email }),
  );

  const invitationId = invite.body.invitation?.id as number;

  await call(
    `/api/organisations/invitations/${invitationId}/accept`,
    json("POST", person.token),
  );
}

const stamp = Date.now();

const founder = await makeUser("Work Founder", `work-founder${stamp}@example.com`);
const john = await makeUser("Work John", `work-john${stamp}@example.com`);
const mary = await makeUser("Work Mary", `work-mary${stamp}@example.com`);
const outsider = await makeUser("Work Outsider", `work-outsider${stamp}@example.com`);

/* ------------------------------------------------------------- fixtures */

let r = await call(
  "/api/organisations",
  json("POST", founder.token, { name: `Work Org A ${stamp}`, type: "company" }),
);
const orgA = r.body.organisation?.id as number;

r = await call(
  "/api/organisations",
  json("POST", outsider.token, { name: `Work Org B ${stamp}`, type: "company" }),
);
const orgB = r.body.organisation?.id as number;

await addActiveMember(orgA, founder.token, john);
await addActiveMember(orgA, founder.token, mary);

/* ---------------------------------------------------------------- access */

r = await call("/api/work");
check("unauthenticated list is refused", r.status === 401, r.status);

/* ---------------------------------------------------------------- create */

r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgA,
    title: `Draft the report ${stamp}`,
    description: "Pull the numbers together.",
    expectedOutput: "A PDF.",
    assigneeProfileId: john.id,
  }),
);
check("an active member can create work", r.status === 201, r.body);

const workItemId = r.body.workItem?.id as number;

check(
  "the initial assignment is active and points at John",
  r.body.assignment?.status === "active" &&
    r.body.assignment?.assigneeProfileId === john.id,
  r.body.assignment,
);

r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgB,
    title: "Should never exist",
    assigneeProfileId: john.id,
  }),
);
check(
  "a non-member cannot create work for another organisation",
  r.status === 404,
  r.body,
);

const orphanTitle = `Orphan attempt ${stamp}`;

r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgA,
    title: orphanTitle,
    assigneeProfileId: outsider.id,
  }),
);
check(
  "work cannot be assigned to somebody outside the organisation",
  r.status === 422 && r.body.errors?.[0]?.field === "assigneeProfileId",
  r.body,
);

check(
  "the rejected assignment left no orphan work item",
  (await db("work_items").where({ title: orphanTitle }).first()) === undefined,
  orphanTitle,
);

/* ------------------------------------------------------------ visibility */

r = await call(`/api/work/${workItemId}`, json("GET", john.token));
check("the assignee can retrieve their work", r.status === 200, r.status);

r = await call(`/api/work/${workItemId}`, json("GET", founder.token));
check("the creator can retrieve work they assigned", r.status === 200, r.status);

r = await call(`/api/work/${workItemId}`, json("GET", outsider.token));
check(
  "an unrelated organisation member is told it does not exist",
  r.status === 404,
  r.status,
);

/* ------------------------------------------------------------ progress */

r = await call(
  `/api/work/${workItemId}`,
  json("PATCH", founder.token, { progress: 150 }),
);
check(
  "progress outside 0-100 is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "progress",
  r.body,
);

r = await call(
  `/api/work/${workItemId}`,
  json("PATCH", founder.token, { progress: 50 }),
);
check(
  "progress accepts a valid value",
  r.status === 200 && r.body.workItem?.progress === 50,
  r.body,
);

/* -------------------------------------------------------------- status */

r = await call(
  `/api/work/${workItemId}`,
  json("PATCH", founder.token, { status: "somewhere-in-between" }),
);
check(
  "an invalid status is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "status",
  r.body,
);

r = await call(
  `/api/work/${workItemId}`,
  json("PATCH", founder.token, { status: "done" }),
);
check(
  "moving to done also completes the progress",
  r.status === 200 &&
    r.body.workItem?.status === "done" &&
    r.body.workItem?.progress === 100,
  r.body,
);

/* --------------------------------------------------------- reassignment */

r = await call(
  `/api/work/${workItemId}/assign`,
  json("POST", founder.token, { assigneeProfileId: mary.id }),
);
check("the creator can reassign", r.status === 200, r.body);

r = await call(`/api/work/${workItemId}`, json("GET", founder.token));
check(
  "the active assignment now points at Mary",
  r.body.activeAssignment?.assigneeProfileId === mary.id,
  r.body.activeAssignment,
);

check(
  "John's assignment is preserved in history, not deleted",
  r.body.assignmentHistory?.length === 2 &&
    r.body.assignmentHistory.some(
      (a: { assigneeProfileId: number; status: string }) =>
        a.assigneeProfileId === john.id && a.status === "reassigned",
    ),
  r.body.assignmentHistory,
);

const activeRows = await db("work_assignments").where({
  work_item_id: workItemId,
  status: "active",
});
check(
  "only one assignment is active at a time",
  activeRows.length === 1,
  activeRows.length,
);

r = await call(
  `/api/work/${workItemId}/assign`,
  json("POST", john.token, { assigneeProfileId: mary.id }),
);
check(
  "a past assignee with no authority cannot reassign",
  r.status === 403,
  r.body,
);

r = await call(
  `/api/work/${workItemId}/assign`,
  json("POST", founder.token, { assigneeProfileId: outsider.id }),
);
check(
  "reassigning to somebody outside the organisation is rejected",
  r.status === 422,
  r.body,
);

r = await call(`/api/work/${workItemId}`, json("GET", founder.token));
check(
  "a failed reassignment left the active assignment untouched",
  r.body.activeAssignment?.assigneeProfileId === mary.id,
  r.body.activeAssignment,
);

/* ------------------------------------------------------------- teardown */

await db("work_items").where({ id: workItemId }).delete();
await db("organisations").whereIn("id", [orgA, orgB]).delete();
await db("profiles")
  .whereIn("id", [founder.id, john.id, mary.id, outsider.id])
  .delete();

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
