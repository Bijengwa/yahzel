import { db } from "../src/db/knex.js";

/**
 * End-to-end check of the Departments backend, in the style of
 * check-hierarchy-api.ts: it drives the running API over HTTP with throwaway
 * accounts and organisations, and removes everything it created.
 *
 * Start the API first:  npm run dev
 */

const API = process.env.CHECK_API_URL ?? "http://localhost:5000";
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

  return { id, fullName, email, token: verified.body.token as string };
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

/** The caller's own organisation_members.id in one organisation. */
async function myMembershipId(orgId: number, token: string): Promise<number> {
  const res = await call(`/api/organisations/${orgId}`, json("GET", token));
  return res.body.membership?.id as number;
}

const stamp = Date.now();

const founder = await makeUser("Dept Founder", `dept-founder${stamp}@example.com`);
const member = await makeUser("Dept Member", `dept-member${stamp}@example.com`);
const outsider = await makeUser("Dept Outsider", `dept-outsider${stamp}@example.com`);
const placeMe = await makeUser("Dept Placed", `dept-placed${stamp}@example.com`);

/* ------------------------------------------------------------------ fixtures */

let r = await call(
  "/api/organisations",
  json("POST", founder.token, { name: `Dept Org A ${stamp}`, type: "company" }),
);
const orgA = r.body.organisation?.id as number;

r = await call(
  "/api/organisations",
  json("POST", outsider.token, { name: `Dept Org B ${stamp}`, type: "company" }),
);
const orgB = r.body.organisation?.id as number;

await addActiveMember(orgA, founder.token, member);
await addActiveMember(orgA, founder.token, placeMe);

// Same-org and cross-org positions for head-position tests. Each organisation
// gets an auto-created "Head" position on registration.
r = await call(`/api/hierarchy/${orgA}`, json("GET", founder.token));
const orgAHeadPosition = r.body.positions?.[0]?.id as number;

r = await call(`/api/hierarchy/${orgB}`, json("GET", outsider.token));
const orgBHeadPosition = r.body.positions?.[0]?.id as number;

const memberIdInA = await myMembershipId(orgA, member.token);
const placeMeIdInA = await myMembershipId(orgA, placeMe.token);
const outsiderIdInB = await myMembershipId(orgB, outsider.token);

/* -------------------------------------------------------------------- access */

r = await call(`/api/departments/${orgA}`);
check("unauthenticated retrieval is refused", r.status === 401, r.status);

r = await call(`/api/departments/${orgA}`, json("GET", member.token));
check(
  "a non-admin member cannot list departments (structure read)",
  r.status === 403,
  r.body,
);

r = await call(
  `/api/departments/${orgA}`,
  json("POST", member.token, { name: "Should never exist" }),
);
check("a non-admin member cannot create a department", r.status === 403, r.body);

r = await call(
  `/api/departments/${orgB}`,
  json("POST", founder.token, { name: "Cross-org" }),
);
check(
  "a non-member cannot create a department in another organisation",
  r.status === 404,
  r.body,
);

/* -------------------------------------------------------------------- create */

r = await call(
  `/api/departments/${orgA}`,
  json("POST", founder.token, { name: "Engineering" }),
);
check(
  "an admin can create a department",
  r.status === 201 && r.body.department?.name === "Engineering",
  r.body,
);
const engineeringId = r.body.department?.id as number;
check(
  "a new department starts with no members and no head",
  r.body.department?.memberCount === 0 &&
    r.body.department?.headPositionId === null &&
    r.body.department?.headPositionName === null,
  r.body.department,
);

r = await call(
  `/api/departments/${orgA}`,
  json("POST", founder.token, { name: "" }),
);
check(
  "an empty department name is rejected on the name field",
  r.status === 422 && r.body.errors?.[0]?.field === "name",
  r.body,
);

/* ---------------------------------------------------------------------- list */

r = await call(`/api/departments/${orgA}`, json("GET", founder.token));
check(
  "the list shows the created department",
  Array.isArray(r.body.departments) &&
    r.body.departments.some(
      (d: { id: number; name: string }) =>
        d.id === engineeringId && d.name === "Engineering",
    ),
  r.body.departments,
);

/* -------------------------------------------------------------------- rename */

r = await call(
  `/api/departments/${orgA}/${engineeringId}`,
  json("PATCH", founder.token, { name: "Platform Engineering" }),
);
check(
  "an admin can rename a department",
  r.status === 200 && r.body.department?.name === "Platform Engineering",
  r.body,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}`,
  json("PATCH", member.token, { name: "Should not apply" }),
);
check("a non-admin cannot rename a department", r.status === 403, r.body);

/* ---------------------------------------------------------- head position */

r = await call(
  `/api/departments/${orgA}/${engineeringId}`,
  json("PATCH", founder.token, { headPositionId: orgAHeadPosition }),
);
check(
  "an admin can set a same-org position as head",
  r.status === 200 &&
    r.body.department?.headPositionId === orgAHeadPosition &&
    typeof r.body.department?.headPositionName === "string",
  r.body,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}`,
  json("PATCH", member.token, { headPositionId: orgAHeadPosition }),
);
check(
  "a non-admin cannot set a department's head position",
  r.status === 403,
  r.body,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}`,
  json("PATCH", founder.token, { headPositionId: orgBHeadPosition }),
);
check(
  "a head position from a different organisation is rejected",
  [400, 404, 422].includes(r.status) &&
    r.body.errors?.[0]?.field === "headPositionId",
  r.body,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}`,
  json("PATCH", founder.token, { headPositionId: null }),
);
check(
  "setting the head position to null clears it",
  r.status === 200 &&
    r.body.department?.headPositionId === null &&
    r.body.department?.headPositionName === null,
  r.body,
);

/* ------------------------------------------------------------ member access */

r = await call(
  `/api/departments/${orgA}/${engineeringId}/members`,
  json("POST", member.token, { memberId: memberIdInA }),
);
check(
  "a non-admin cannot add a department member (occupancy capability)",
  r.status === 403,
  r.body,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}/members`,
  json("POST", founder.token, { memberId: outsiderIdInB }),
);
check(
  "a member id from another organisation is rejected",
  r.status === 404 && r.body.errors?.[0]?.field === "memberId",
  r.body,
);

/* -------------------------------------------------------------- add member */

r = await call(
  `/api/departments/${orgA}/${engineeringId}/members`,
  json("POST", founder.token, { memberId: memberIdInA }),
);
check(
  "an admin can add an active same-org member",
  r.status === 201 &&
    r.body.member?.memberId === memberIdInA &&
    r.body.member?.name === member.fullName &&
    r.body.member?.email === member.email &&
    typeof r.body.member?.designation === "string",
  r.body,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}`,
  json("PATCH", founder.token, {}),
);
check(
  "the department's member count is now 1",
  r.body.department?.memberCount === 1,
  r.body.department,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}/members`,
  json("GET", founder.token),
);
check(
  "the member appears in the members list with name, email and designation",
  Array.isArray(r.body.members) &&
    r.body.members.length === 1 &&
    r.body.members[0]?.memberId === memberIdInA &&
    r.body.members[0]?.name === member.fullName &&
    r.body.members[0]?.email === member.email &&
    typeof r.body.members[0]?.designation === "string",
  r.body.members,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}/members`,
  json("POST", founder.token, { memberId: memberIdInA }),
);
check(
  "adding the same member twice is refused as a conflict",
  r.status === 409,
  r.body,
);

/* ----------------------------------------------------------- remove member */

r = await call(
  `/api/departments/${orgA}/${engineeringId}/members/${memberIdInA}`,
  json("DELETE", member.token),
);
check(
  "a non-admin cannot remove a department member",
  r.status === 403,
  r.body,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}/members/${memberIdInA}`,
  json("DELETE", founder.token),
);
check(
  "an admin can remove a department member",
  r.status === 200 && r.body.success === true,
  r.body,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}/members/${memberIdInA}`,
  json("DELETE", founder.token),
);
check(
  "removing a person who is not a member is a 404",
  r.status === 404,
  r.body,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}`,
  json("PATCH", founder.token, {}),
);
check(
  "the department's member count is back to 0",
  r.body.department?.memberCount === 0,
  r.body.department,
);

/* ------------------------------------------------- integrity: conclude */

// A separate department and a real position occupancy, to prove concluding a
// membership vacates the position (history preserved) AND clears the roster.
r = await call(
  `/api/departments/${orgA}`,
  json("POST", founder.token, { name: "Operations" }),
);
const operationsId = r.body.department?.id as number;

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, { name: "Analyst", parentPositionId: orgAHeadPosition }),
);
const analystId = r.body.position?.id as number;

await call(
  `/api/departments/${orgA}/${operationsId}/members`,
  json("POST", founder.token, { memberId: placeMeIdInA }),
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${analystId}/occupant`,
  json("POST", founder.token, { memberId: placeMeIdInA }),
);
check(
  "the placed member occupies the Analyst position",
  r.status === 201 && r.body.occupancy?.memberId === placeMeIdInA,
  r.body,
);

// Conclude their membership.
r = await call(
  `/api/organisations/${orgA}/members/${placeMeIdInA}`,
  json("DELETE", founder.token),
);
check(
  "concluding the membership succeeds",
  r.status === 200 && r.body.membership?.status === "concluded",
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${analystId}/occupant`,
  json("GET", founder.token),
);
check(
  "the position is now vacant after the membership was concluded",
  r.body.occupant === null,
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/members/${placeMeIdInA}/occupancy-history`,
  json("GET", founder.token),
);
check(
  "the occupancy history is preserved, with the row now ended",
  Array.isArray(r.body.history) &&
    r.body.history.length === 1 &&
    r.body.history[0]?.positionId === analystId &&
    r.body.history[0]?.endsAt !== null,
  r.body.history,
);

r = await call(
  `/api/departments/${orgA}/${operationsId}/members`,
  json("GET", founder.token),
);
check(
  "the concluded member no longer appears in the department roster",
  Array.isArray(r.body.members) &&
    !r.body.members.some(
      (m: { memberId: number }) => m.memberId === placeMeIdInA,
    ),
  r.body.members,
);

/* -------------------------------------------------------------------- delete */

r = await call(
  `/api/departments/${orgA}/${engineeringId}`,
  json("DELETE", member.token),
);
check("a non-admin cannot delete a department", r.status === 403, r.body);

r = await call(
  `/api/departments/${orgA}/${engineeringId}`,
  json("DELETE", founder.token),
);
check(
  "an admin can delete a department",
  r.status === 200 && r.body.success === true,
  r.body,
);

r = await call(`/api/departments/${orgA}`, json("GET", founder.token));
check(
  "the deleted department is gone from the list",
  !r.body.departments?.some((d: { id: number }) => d.id === engineeringId),
  r.body.departments,
);

r = await call(
  `/api/departments/${orgA}/${engineeringId}/members`,
  json("GET", founder.token),
);
check(
  "the deleted department's members endpoint is a 404",
  r.status === 404,
  r.body,
);

/* ------------------------------------------------------------------ isolation */

r = await call(`/api/departments/${orgB}`, json("GET", outsider.token));
check(
  "organisation B never sees organisation A's departments",
  Array.isArray(r.body.departments) && r.body.departments.length === 0,
  r.body.departments,
);

/* ------------------------------------------------------------------- teardown */

await db("departments").whereIn("organisation_id", [orgA, orgB]).delete();
await db("positions").whereIn("organisation_id", [orgA, orgB]).delete();
await db("organisations").whereIn("id", [orgA, orgB]).delete();
await db("profiles")
  .whereIn("id", [founder.id, member.id, outsider.id, placeMe.id])
  .delete();

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
