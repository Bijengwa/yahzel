import { db } from "../src/db/knex.js";

/**
 * End-to-end check of the organisational hierarchy foundation, in the style
 * of check-work-api.ts: it drives the running API over HTTP with throwaway
 * accounts and organisations, and removes everything it created.
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

const founder = await makeUser("Hierarchy Founder", `hier-founder${stamp}@example.com`);
const member = await makeUser("Hierarchy Member", `hier-member${stamp}@example.com`);
const outsider = await makeUser("Hierarchy Outsider", `hier-outsider${stamp}@example.com`);

/* ------------------------------------------------------------- fixtures */

let r = await call(
  "/api/organisations",
  json("POST", founder.token, { name: `Hierarchy Org A ${stamp}`, type: "company" }),
);
const orgA = r.body.organisation?.id as number;

r = await call(
  "/api/organisations",
  json("POST", outsider.token, { name: `Hierarchy Org B ${stamp}`, type: "company" }),
);
const orgB = r.body.organisation?.id as number;

await addActiveMember(orgA, founder.token, member);

/* ---------------------------------------------------------------- access */

r = await call(`/api/hierarchy/${orgA}`);
check("unauthenticated retrieval is refused", r.status === 401, r.status);

r = await call(`/api/hierarchy/${orgA}`, json("GET", member.token));
check(
  "a non-admin member cannot retrieve the hierarchy",
  r.status === 403,
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", member.token, { name: "Should never exist" }),
);
check(
  "a non-admin member cannot create a position",
  r.status === 403,
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", outsider.token, { name: "Should never exist" }),
);
check(
  "a non-member cannot create a position in another organisation",
  r.status === 404,
  r.body,
);

/* ------------------------------------------------------- head-on-create */

r = await call(`/api/hierarchy/${orgA}`, json("GET", founder.token));
check(
  "registering an organisation automatically creates its Head",
  r.body.positions?.length === 1 && r.body.positions?.[0]?.name === "Head",
  r.body.positions,
);
check(
  "the auto-created Head has no parent",
  r.body.positions?.[0]?.parentPositionId === null,
  r.body.positions,
);
const headId = r.body.positions?.[0]?.id as number;

/* ---------------------------------------------------------------- create */

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, { name: "Manager", parentPositionId: headId }),
);
check("an admin can create a child position", r.status === 201, r.body);
const managerId = r.body.position?.id as number;

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, { name: "Officer", parentPositionId: managerId }),
);
check("a grandchild position can be created", r.status === 201, r.body);
const officerId = r.body.position?.id as number;

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, { name: "Secretary General" }),
);
check(
  "a second, independent root position is allowed",
  r.status === 201 && r.body.position?.parentPositionId === null,
  r.body,
);
const secondRootId = r.body.position?.id as number;

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, { name: "Assistant", parentPositionId: managerId }),
);
check("a second branch under the same parent is allowed", r.status === 201, r.body);
const assistantId = r.body.position?.id as number;

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, { name: "Nonexistent Parent Test", parentPositionId: 999999 }),
);
check(
  "a nonexistent parent is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "parentPositionId",
  r.body,
);

r = await call(`/api/hierarchy/${orgB}`, json("GET", outsider.token));
check(
  "organisation B has only its own auto-created Head, regardless of A's activity",
  r.body.positions?.length === 1 && r.body.positions?.[0]?.name === "Head",
  r.body.positions,
);
const bRootId = r.body.positions?.[0]?.id as number;

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, { name: "Cross-org child", parentPositionId: bRootId }),
);
check(
  "a position from another organisation cannot become a parent",
  r.status === 422 && r.body.errors?.[0]?.field === "parentPositionId",
  r.body,
);

/* ------------------------------------------------------------ retrieval */

r = await call(`/api/hierarchy/${orgA}`, json("GET", founder.token));
check(
  "the hierarchy lists every position for the organisation",
  r.body.positions?.length === 5,
  r.body.positions,
);

check(
  "no position carries an occupant/person field",
  r.body.positions?.every(
    (p: Record<string, unknown>) =>
      !("occupantId" in p) && !("personId" in p) && !("profileId" in p),
  ),
  r.body.positions,
);

/* -------------------------------------------------------------- rename */

r = await call(
  `/api/hierarchy/${orgA}/positions/${managerId}`,
  json("PATCH", founder.token, { name: "Senior Manager" }),
);
check(
  "an admin can rename a position",
  r.status === 200 && r.body.position?.name === "Senior Manager",
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${managerId}`,
  json("PATCH", member.token, { name: "Should not apply" }),
);
check("a non-admin cannot rename a position", r.status === 403, r.body);

/* ---------------------------------------------------------------- move */

r = await call(
  `/api/hierarchy/${orgA}/positions/${assistantId}`,
  json("PATCH", founder.token, { parentPositionId: secondRootId }),
);
check(
  "a valid move to a different parent succeeds",
  r.status === 200 && r.body.position?.parentPositionId === secondRootId,
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${managerId}`,
  json("PATCH", founder.token, { parentPositionId: managerId }),
);
check(
  "a position cannot become its own parent",
  r.status === 422 && r.body.errors?.[0]?.field === "parentPositionId",
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${managerId}`,
  json("PATCH", founder.token, { parentPositionId: officerId }),
);
check(
  "moving a position under its own descendant is rejected as a cycle",
  r.status === 422 && r.body.errors?.[0]?.field === "parentPositionId",
  r.body,
);

r = await call(`/api/hierarchy/${orgA}`, json("GET", founder.token));
const managerAfterCycleAttempt = r.body.positions?.find(
  (p: { id: number }) => p.id === managerId,
);
check(
  "the rejected cyclic move left Manager's parent untouched",
  managerAfterCycleAttempt?.parentPositionId === headId,
  managerAfterCycleAttempt,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${managerId}`,
  json("PATCH", founder.token, { parentPositionId: bRootId }),
);
check(
  "moving a position to a parent in another organisation is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "parentPositionId",
  r.body,
);

/* -------------------------------------------------------------- delete */

// Assistant was moved under Second Root above, so deleting Second Root
// exercises the cascade: Assistant should disappear with it.
r = await call(
  `/api/hierarchy/${orgA}/positions/${secondRootId}`,
  json("DELETE", member.token),
);
check("a non-admin cannot delete a position", r.status === 403, r.body);

r = await call(
  `/api/hierarchy/${orgA}/positions/${secondRootId}`,
  json("DELETE", founder.token),
);
check(
  "deleting a position with one child reports that descendant",
  r.status === 200 && r.body.deletedCount === 2,
  r.body,
);

const secondRootRow = await db("positions").where({ id: secondRootId }).first();
check("the deleted position is actually gone", secondRootRow === undefined, secondRootRow);

const assistantRow = await db("positions").where({ id: assistantId }).first();
check(
  "its child was cascaded away too, not left orphaned",
  assistantRow === undefined,
  assistantRow,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${headId}`,
  json("DELETE", founder.token),
);
check(
  "deleting Head reports its two remaining descendants (Manager, Officer)",
  r.status === 200 && r.body.deletedCount === 3,
  r.body,
);

const remaining = await db("positions").where({ organisation_id: orgA });
check(
  "nothing was left behind — the whole subtree is gone",
  remaining.length === 0,
  remaining,
);

/* ------------------------------------------------------ departments (W1) */

r = await call(`/api/hierarchy/${orgA}`, json("GET", founder.token));
check(
  "the hierarchy response includes an (empty) departments list",
  Array.isArray(r.body.departments) && r.body.departments.length === 0,
  r.body.departments,
);

// Fresh structure for the department checks, independent of the deletions above.
r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, { name: "Deputy Head" }),
);
const newHeadForDeptId = r.body.position?.id as number;

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, {
    name: "Would-be Manager",
    parentPositionId: newHeadForDeptId,
  }),
);
const wouldBeManagerId = r.body.position?.id as number;

r = await call(
  `/api/hierarchy/${orgA}/departments`,
  json("POST", member.token, { name: "Should never exist" }),
);
check("a non-admin cannot create a department", r.status === 403, r.body);

r = await call(
  `/api/hierarchy/${orgA}/departments`,
  json("POST", founder.token, {
    name: "Procurement Department",
    parentPositionId: newHeadForDeptId,
  }),
);
check(
  "an admin can create a headless department",
  r.status === 201 &&
    r.body.department?.headPositionId === null &&
    r.body.department?.memberCount === 0,
  r.body,
);
const procurementDeptId = r.body.department?.id as number;

r = await call(
  `/api/hierarchy/${orgA}/departments/${procurementDeptId}`,
  json("PATCH", founder.token, { headPositionId: wouldBeManagerId }),
);
check(
  "assigning a head that already had a parent normalises headPositionName",
  r.status === 200 &&
    r.body.department?.headPositionId === wouldBeManagerId &&
    r.body.department?.headPositionName === "Would-be Manager",
  r.body,
);

r = await call(`/api/hierarchy/${orgA}`, json("GET", founder.token));
const managerAfterHeadship = r.body.positions?.find(
  (p: { id: number }) => p.id === wouldBeManagerId,
);
check(
  "the new head's own parentPositionId is normalised to null",
  managerAfterHeadship?.parentPositionId === null,
  managerAfterHeadship,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${wouldBeManagerId}`,
  json("PATCH", founder.token, { parentPositionId: newHeadForDeptId }),
);
check(
  "a department head's parent cannot be changed via the position endpoint",
  r.status === 422 && r.body.errors?.[0]?.field === "parentPositionId",
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/departments`,
  json("POST", founder.token, {
    name: "Duplicate Head Department",
    headPositionId: wouldBeManagerId,
  }),
);
check(
  "a position cannot head two departments",
  r.status === 422 && r.body.errors?.[0]?.field === "headPositionId",
  r.body,
);

// A fresh, unheaded position chain, so this specifically exercises the
// cycle check rather than the head-uniqueness check above.
r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, { name: "Ops Head" }),
);
const opsHeadId = r.body.position?.id as number;

r = await call(
  `/api/hierarchy/${orgA}/positions`,
  json("POST", founder.token, { name: "Ops Sub", parentPositionId: opsHeadId }),
);
const opsSubId = r.body.position?.id as number;

r = await call(
  `/api/hierarchy/${orgA}/departments`,
  json("POST", founder.token, {
    name: "Cyclic Department",
    parentPositionId: opsSubId,
    headPositionId: opsHeadId,
  }),
);
check(
  "a department cannot be parented under its own head's subtree",
  r.status === 422 && r.body.errors?.[0]?.field === "parentPositionId",
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/departments/${procurementDeptId}`,
  json("GET", member.token),
);
check("a non-admin cannot view department detail", r.status === 403, r.body);

r = await call(
  `/api/hierarchy/${orgA}/departments/${procurementDeptId}`,
  json("GET", founder.token),
);
check(
  "department detail lists the (still empty) roster",
  r.status === 200 && Array.isArray(r.body.members) && r.body.members.length === 0,
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/departments/${procurementDeptId}/members`,
  json("POST", founder.token, { memberId: 999999 }),
);
check(
  "adding a nonexistent member is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "memberId",
  r.body,
);

const memberRow = await db("organisation_members")
  .where({ organisation_id: orgA, profile_id: member.id })
  .first();
const memberRowId = memberRow.id as number;

r = await call(
  `/api/hierarchy/${orgA}/departments/${procurementDeptId}/members`,
  json("POST", founder.token, { memberId: memberRowId }),
);
check("an admin can add a department member", r.status === 201, r.body);

r = await call(
  `/api/hierarchy/${orgA}/departments/${procurementDeptId}/members`,
  json("POST", founder.token, { memberId: memberRowId }),
);
check(
  "adding the same member twice is rejected",
  r.status === 422 && r.body.errors?.[0]?.field === "memberId",
  r.body,
);

r = await call(`/api/hierarchy/${orgA}`, json("GET", founder.token));
const procurementInList = r.body.departments?.find(
  (d: { id: number }) => d.id === procurementDeptId,
);
check(
  "the tree list reflects the new member count",
  procurementInList?.memberCount === 1,
  procurementInList,
);

r = await call(
  `/api/hierarchy/${orgA}/departments/${procurementDeptId}/members/${memberRowId}`,
  json("DELETE", member.token),
);
check("a non-admin cannot remove a department member", r.status === 403, r.body);

r = await call(
  `/api/hierarchy/${orgA}/departments/${procurementDeptId}/members/${memberRowId}`,
  json("DELETE", founder.token),
);
check("an admin can remove a department member", r.status === 200, r.body);

r = await call(
  `/api/hierarchy/${orgB}/departments`,
  json("POST", outsider.token, {
    name: "Cross-org head test",
    headPositionId: wouldBeManagerId,
  }),
);
check(
  "a position from another organisation cannot become a head",
  r.status === 422 && r.body.errors?.[0]?.field === "headPositionId",
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/departments/${procurementDeptId}`,
  json("DELETE", founder.token),
);
check("an admin can delete a department", r.status === 200, r.body);

r = await call(`/api/hierarchy/${orgA}`, json("GET", founder.token));
const managerAfterDeptDelete = r.body.positions?.find(
  (p: { id: number }) => p.id === wouldBeManagerId,
);
check(
  "deleting the department leaves its former head as a root position",
  managerAfterDeptDelete?.parentPositionId === null,
  managerAfterDeptDelete,
);

const remainingDeptRow = await db("departments")
  .where({ id: procurementDeptId })
  .first();
check(
  "the deleted department is actually gone",
  remainingDeptRow === undefined,
  remainingDeptRow,
);

/* ------------------------------------------------------------- teardown */

await db("department_members")
  .whereIn(
    "department_id",
    db("departments").select("id").whereIn("organisation_id", [orgA, orgB]),
  )
  .delete();
await db("departments").whereIn("organisation_id", [orgA, orgB]).delete();
await db("positions").whereIn("organisation_id", [orgA, orgB]).delete();
await db("organisations").whereIn("id", [orgA, orgB]).delete();
await db("profiles")
  .whereIn("id", [founder.id, member.id, outsider.id])
  .delete();

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
