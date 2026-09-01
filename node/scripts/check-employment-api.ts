import { db } from "../src/db/knex.js";

/**
 * End-to-end check of the Phase 3 Employment/Contract backend, in the style
 * of check-departments-api.ts: it drives the running API over HTTP with
 * throwaway accounts and organisations, and removes everything it created.
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

const founder = await makeUser("Emp Founder", `emp-founder${stamp}@example.com`);
const member = await makeUser("Emp Member", `emp-member${stamp}@example.com`);
const outsider = await makeUser("Emp Outsider", `emp-outsider${stamp}@example.com`);
const placeMe = await makeUser("Emp Placed", `emp-placed${stamp}@example.com`);

/* ------------------------------------------------------------------ fixtures */

let r = await call(
  "/api/organisations",
  json("POST", founder.token, { name: `Emp Org A ${stamp}`, type: "company" }),
);
const orgA = r.body.organisation?.id as number;

r = await call(
  "/api/organisations",
  json("POST", outsider.token, { name: `Emp Org B ${stamp}`, type: "company" }),
);
const orgB = r.body.organisation?.id as number;

await addActiveMember(orgA, founder.token, member);
await addActiveMember(orgA, founder.token, placeMe);

// Each organisation gets an auto-created "Head" position on registration.
r = await call(`/api/hierarchy/${orgA}`, json("GET", founder.token));
const orgAHeadPosition = r.body.positions?.[0]?.id as number;

const memberIdInA = await myMembershipId(orgA, member.token);
const placeMeIdInA = await myMembershipId(orgA, placeMe.token);
const outsiderIdInB = await myMembershipId(orgB, outsider.token);

/* -------------------------------------------------------------------- access */

r = await call(`/api/employment/${orgA}/members/${memberIdInA}`);
check("unauthenticated retrieval is refused", r.status === 401, r.status);

r = await call(
  `/api/employment/${orgA}/members/${memberIdInA}`,
  json("GET", member.token),
);
check(
  "a non-admin member cannot view an employment record (occupancy capability)",
  r.status === 403,
  r.body,
);

r = await call(
  `/api/employment/${orgA}/members/${memberIdInA}`,
  json("POST", member.token, { startDate: "2026-01-01" }),
);
check("a non-admin member cannot create an employment record", r.status === 403, r.body);

r = await call(
  `/api/employment/${orgB}/members/${outsiderIdInB}`,
  json("POST", founder.token, { startDate: "2026-01-01" }),
);
check(
  "a non-member cannot create an employment record in another organisation",
  r.status === 404,
  r.body,
);

/* ------------------------------------------------------------------- create */

r = await call(
  `/api/employment/${orgA}/members/${memberIdInA}`,
  json("POST", founder.token, {
    startDate: "not-a-date",
  }),
);
check(
  "an invalid start date is rejected on the startDate field",
  r.status === 422 && r.body.errors?.[0]?.field === "startDate",
  r.body,
);

r = await call(
  `/api/employment/${orgA}/members/${memberIdInA}`,
  json("POST", founder.token, {
    employmentStatus: "not-a-status",
    startDate: "2026-01-01",
  }),
);
check(
  "an invalid employment status is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "employmentStatus",
  r.body,
);

r = await call(
  `/api/employment/${orgA}/members/${outsiderIdInB}`,
  json("POST", founder.token, { startDate: "2026-01-01" }),
);
check(
  "a member id from another organisation is rejected",
  r.status === 404,
  r.body,
);

r = await call(
  `/api/employment/${orgA}/members/${memberIdInA}`,
  json("POST", founder.token, {
    startDate: "2026-01-01",
    notes: "Joined via referral.",
  }),
);
check(
  "an admin can create an employment record for an active member",
  r.status === 201 &&
    r.body.employmentRecord?.memberId === memberIdInA &&
    r.body.employmentRecord?.employmentStatus === "active" &&
    r.body.employmentRecord?.isCurrent === true &&
    r.body.employmentRecord?.notes === "Joined via referral.",
  r.body,
);
const employmentId = r.body.employmentRecord?.id as number;

r = await call(
  `/api/employment/${orgA}/members/${memberIdInA}`,
  json("POST", founder.token, { startDate: "2026-02-01" }),
);
check(
  "a duplicate current employment record is rejected",
  r.status === 409,
  r.body,
);

/* --------------------------------------------------------------------- read */

r = await call(
  `/api/employment/${orgA}/members/${memberIdInA}`,
  json("GET", founder.token),
);
check(
  "the employment record is returned with its history and placement",
  r.status === 200 &&
    r.body.employmentRecord?.id === employmentId &&
    Array.isArray(r.body.history) &&
    r.body.history.length === 1 &&
    r.body.placement?.position === null &&
    Array.isArray(r.body.placement?.departments) &&
    r.body.placement.departments.length === 0,
  r.body,
);

/* ------------------------------------------------------- position relationship */

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, {
    name: "Support Officer",
    parentPositionId: orgAHeadPosition,
  }),
);
const supportOfficerId = r.body.position?.id as number;

await call(
  `/api/hierarchy/${orgA}/positions/${supportOfficerId}/occupant`,
  json("POST", founder.token, { memberId: memberIdInA }),
);

r = await call(
  `/api/employment/${orgA}/members/${memberIdInA}`,
  json("GET", founder.token),
);
check(
  "the employment record's placement reflects the existing occupancy, not a duplicated field",
  r.body.placement?.position?.id === supportOfficerId &&
    r.body.placement?.position?.name === "Support Officer",
  r.body.placement,
);

const employmentColumns = await db("employment_records").columnInfo();
check(
  "employment_records carries no position_id/department_id column of its own",
  !("position_id" in employmentColumns) && !("department_id" in employmentColumns),
  Object.keys(employmentColumns),
);

/* ------------------------------------------------------------------- update */

r = await call(
  `/api/employment/${orgA}/${employmentId}`,
  json("PATCH", member.token, { notes: "Should not apply" }),
);
check("a non-admin cannot update an employment record", r.status === 403, r.body);

r = await call(
  `/api/employment/${orgA}/${employmentId}`,
  json("PATCH", founder.token, { endDate: "2020-01-01" }),
);
check(
  "an end date before the start date is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "endDate",
  r.body,
);

r = await call(
  `/api/employment/${orgA}/${employmentId}`,
  json("PATCH", founder.token, { employmentStatus: "inactive" }),
);
check(
  "an admin can update the employment status",
  r.status === 200 &&
    r.body.employmentRecord?.employmentStatus === "inactive" &&
    r.body.employmentRecord?.isCurrent === true,
  r.body,
);

r = await call(`/api/employment/${orgB}/${employmentId}`, json("GET", outsider.token));
check(
  "an employment record cannot be reached through another organisation's id",
  r.status === 404,
  r.body,
);

/* ------------------------------------------------------------------ contracts */

r = await call(
  `/api/employment/${orgA}/${employmentId}/contracts`,
  json("POST", member.token, { startDate: "2026-01-01" }),
);
check("a non-admin cannot create a contract", r.status === 403, r.body);

r = await call(
  `/api/employment/${orgA}/${employmentId}/contracts`,
  json("POST", founder.token, {
    contractType: "not-a-type",
    startDate: "2026-01-01",
  }),
);
check(
  "an invalid contract type is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "contractType",
  r.body,
);

r = await call(
  `/api/employment/${orgA}/${employmentId}/contracts`,
  json("POST", founder.token, {
    contractType: "probation",
    startDate: "2026-01-01",
    endDate: "2025-01-01",
  }),
);
check(
  "a contract end date before its start date is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "endDate",
  r.body,
);

r = await call(
  `/api/employment/${orgA}/${employmentId}/contracts`,
  json("POST", founder.token, {
    contractType: "probation",
    startDate: "2026-01-01",
  }),
);
check(
  "an admin can create an active contract for the employment record",
  r.status === 201 &&
    r.body.contract?.employmentRecordId === employmentId &&
    r.body.contract?.contractType === "probation" &&
    r.body.contract?.status === "active",
  r.body,
);
const probationContractId = r.body.contract?.id as number;

r = await call(
  `/api/employment/${orgA}/${employmentId}/contracts`,
  json("POST", founder.token, {
    contractType: "permanent",
    startDate: "2026-02-01",
  }),
);
check(
  "two overlapping active contracts on the same employment record are rejected",
  r.status === 409,
  r.body,
);

r = await call(
  `/api/employment/${orgB}/${employmentId}/contracts`,
  json("GET", outsider.token),
);
check(
  "the employment record's contracts cannot be reached through another organisation",
  r.status === 404,
  r.body,
);

/* ------------------------------------------------------------- end + replace */

r = await call(
  `/api/employment/${orgA}/${employmentId}/contracts/${probationContractId}`,
  json("PATCH", member.token, { status: "ended" }),
);
check("a non-admin cannot end a contract", r.status === 403, r.body);

r = await call(
  `/api/employment/${orgA}/${employmentId}/contracts/${probationContractId}`,
  json("PATCH", founder.token, { status: "ended" }),
);
check(
  "an admin can end the active contract",
  r.status === 200 &&
    r.body.contract?.status === "ended" &&
    r.body.contract?.endDate !== null,
  r.body,
);

r = await call(
  `/api/employment/${orgA}/${employmentId}/contracts`,
  json("POST", founder.token, {
    contractType: "permanent",
    startDate: "2026-06-01",
  }),
);
check(
  "a replacement contract can now be created",
  r.status === 201 && r.body.contract?.status === "active",
  r.body,
);
const permanentContractId = r.body.contract?.id as number;

r = await call(
  `/api/employment/${orgA}/${employmentId}/contracts`,
  json("GET", founder.token),
);
check(
  "contract history is preserved: both the ended probation and the active replacement remain",
  Array.isArray(r.body.contracts) &&
    r.body.contracts.length === 2 &&
    r.body.contracts.some(
      (c: { id: number; status: string }) =>
        c.id === probationContractId && c.status === "ended",
    ) &&
    r.body.contracts.some(
      (c: { id: number; status: string }) =>
        c.id === permanentContractId && c.status === "active",
    ),
  r.body.contracts,
);

/* ------------------------------------------------- integrity: conclude cascades */

// A fresh membership, employment record and active contract, to prove
// concluding the membership closes both (history preserved) — mirroring
// check-departments-api.ts's own conclude-cascade test for occupancy/rosters.
r = await call(
  `/api/employment/${orgA}/members/${placeMeIdInA}`,
  json("POST", founder.token, { startDate: "2026-01-01" }),
);
const placeMeEmploymentId = r.body.employmentRecord?.id as number;

r = await call(
  `/api/employment/${orgA}/${placeMeEmploymentId}/contracts`,
  json("POST", founder.token, { contractType: "permanent", startDate: "2026-01-01" }),
);
const placeMeContractId = r.body.contract?.id as number;

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
  `/api/employment/${orgA}/members/${placeMeIdInA}`,
  json("GET", founder.token),
);
check(
  "the employment record is closed (concluded, with an end date) after the membership concludes",
  r.body.employmentRecord === null &&
    r.body.history?.[0]?.id === placeMeEmploymentId &&
    r.body.history?.[0]?.employmentStatus === "concluded" &&
    r.body.history?.[0]?.endDate !== null,
  r.body,
);

r = await call(
  `/api/employment/${orgA}/${placeMeEmploymentId}/contracts`,
  json("GET", founder.token),
);
check(
  "the contract is ended (never deleted) after the membership concludes",
  r.body.contracts?.find((c: { id: number }) => c.id === placeMeContractId)
    ?.status === "ended",
  r.body.contracts,
);

/* -------------------------------------------------------------------- teardown */

await db("contracts").whereIn("organisation_id", [orgA, orgB]).delete();
await db("employment_records").whereIn("organisation_id", [orgA, orgB]).delete();
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
