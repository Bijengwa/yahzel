import { db } from "../src/db/knex.js";

/**
 * End-to-end check of the organisational hierarchy foundation, in the style
 * of check-work-api.ts: it drives the running API over HTTP with throwaway
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

/* ------------------------------------------------------------ occupancy */

const member2 = await makeUser(
  "Hierarchy Member Two",
  `hier-member2${stamp}@example.com`,
);
await addActiveMember(orgA, founder.token, member2);

// `member` also becomes an active participant of Organisation B, to prove a
// person can occupy a position in one organisation and a different one in
// another without the two ever colliding (rules 3/4).
await addActiveMember(orgB, outsider.token, member);

/** The caller's own organisation_members.id in one organisation. */
async function myMembershipId(orgId: number, token: string): Promise<number> {
  const res = await call(`/api/organisations/${orgId}`, json("GET", token));
  return res.body.membership?.id as number;
}

const memberIdInA = await myMembershipId(orgA, member.token);
const member2IdInA = await myMembershipId(orgA, member2.token);
const founderIdInA = await myMembershipId(orgA, founder.token);
const memberIdInB = await myMembershipId(orgB, member.token);
const outsiderIdInB = await myMembershipId(orgB, outsider.token);

// 1. A position can exist vacant.
r = await call(
  `/api/hierarchy/${orgA}/positions/${officerId}/occupant`,
  json("GET", founder.token),
);
check(
  "a freshly created position starts vacant",
  r.status === 200 && r.body.occupant === null,
  r.body,
);

// 14. Unauthorized user cannot change occupancy.
r = await call(
  `/api/hierarchy/${orgA}/positions/${officerId}/occupant`,
  json("POST", member.token, { memberId: memberIdInA }),
);
check("a non-admin member cannot assign an occupant", r.status === 403, r.body);

// 2 & 3. Assign an active organisation member to a vacant position; the
// position returns its occupant.
r = await call(
  `/api/hierarchy/${orgA}/positions/${officerId}/occupant`,
  json("POST", founder.token, { memberId: memberIdInA }),
);
check(
  "an admin can assign an active member to a vacant position",
  r.status === 201 && r.body.occupancy?.memberId === memberIdInA,
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${officerId}/occupant`,
  json("GET", founder.token),
);
check(
  "the position now returns its occupant",
  r.body.occupant?.memberId === memberIdInA && r.body.occupant?.isActive === true,
  r.body,
);

// 4. The same person cannot occupy two positions simultaneously in one
// organisation.
r = await call(
  `/api/hierarchy/${orgA}/positions/${managerId}/occupant`,
  json("POST", founder.token, { memberId: memberIdInA }),
);
check(
  "the same person cannot occupy a second position in the same organisation",
  r.status === 409 && r.body.errors?.[0]?.field === "memberId",
  r.body,
);

// 5. The same position cannot have two active occupants.
r = await call(
  `/api/hierarchy/${orgA}/positions/${officerId}/occupant`,
  json("POST", founder.token, { memberId: member2IdInA }),
);
check(
  "a position with an active occupant refuses a second assignment",
  r.status === 409,
  r.body,
);

// 6. A person can occupy a position in Organisation A and another position
// in Organisation B.
r = await call(
  `/api/hierarchy/${orgB}/positions/${bRootId}/occupant`,
  json("POST", outsider.token, { memberId: memberIdInB }),
);
check(
  "the same person can occupy a position in a different organisation",
  r.status === 201 && r.body.occupancy?.memberId === memberIdInB,
  r.body,
);

// 11. Cross-organisation position assignment is rejected.
r = await call(
  `/api/hierarchy/${orgB}/positions/${managerId}/occupant`,
  json("POST", outsider.token, { memberId: memberIdInB }),
);
check(
  "assigning a position that belongs to another organisation is rejected",
  r.status === 404,
  r.body,
);

// 12. Cross-organisation member assignment is rejected.
r = await call(
  `/api/hierarchy/${orgA}/positions/${managerId}/occupant`,
  json("POST", founder.token, { memberId: outsiderIdInB }),
);
check(
  "assigning a member id that belongs to another organisation is rejected",
  r.status === 404 && r.body.errors?.[0]?.field === "memberId",
  r.body,
);

// 13. An inactive/non-eligible member cannot be assigned.
const member3 = await makeUser(
  "Hierarchy Member Three",
  `hier-member3${stamp}@example.com`,
);
await addActiveMember(orgA, founder.token, member3);
const member3IdInA = await myMembershipId(orgA, member3.token);

await call(
  `/api/organisations/${orgA}/members/${member3IdInA}`,
  json("DELETE", founder.token),
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${managerId}/occupant`,
  json("POST", founder.token, { memberId: member3IdInA }),
);
check(
  "a concluded (inactive) member cannot be assigned to a position",
  r.status === 422 && r.body.errors?.[0]?.field === "memberId",
  r.body,
);

// 15 & 16. The Head position can be occupied, and it is reflected correctly.
r = await call(`/api/hierarchy/${orgA}`, json("GET", founder.token));
check(
  "the Head position is still the first (earliest-created) root",
  r.body.positions?.[0]?.id === headId,
  r.body.positions,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${headId}/occupant`,
  json("POST", founder.token, { memberId: founderIdInA }),
);
check(
  "the Head position itself can be occupied",
  r.status === 201 && r.body.occupancy?.memberId === founderIdInA,
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${headId}/occupant`,
  json("GET", founder.token),
);
check(
  "the Head position correctly reflects its occupant",
  r.body.occupant?.memberId === founderIdInA,
  r.body,
);

// 10. Replace an occupant correctly.
r = await call(
  `/api/hierarchy/${orgA}/positions/${officerId}/occupant`,
  json("PUT", founder.token, { memberId: member2IdInA }),
);
check(
  "replacing an occupant swaps them atomically",
  r.status === 200 && r.body.occupancy?.memberId === member2IdInA,
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${officerId}/occupant`,
  json("GET", founder.token),
);
check(
  "after a replace, the position shows the new occupant",
  r.body.occupant?.memberId === member2IdInA,
  r.body,
);

// The replaced-out person is free again — proving replace actually ended
// their old occupancy rather than leaving two active rows behind.
r = await call(
  `/api/hierarchy/${orgA}/positions/${managerId}/occupant`,
  json("POST", founder.token, { memberId: memberIdInA }),
);
check(
  "a replaced-out occupant is free to occupy a different position",
  r.status === 201,
  r.body,
);

// 7 & 8. End occupancy; the position becomes vacant.
r = await call(
  `/api/hierarchy/${orgA}/positions/${officerId}/occupant`,
  json("DELETE", founder.token),
);
check("ending an occupancy succeeds", r.status === 200, r.body);

r = await call(
  `/api/hierarchy/${orgA}/positions/${officerId}/occupant`,
  json("GET", founder.token),
);
check(
  "the position is vacant again after ending its occupancy",
  r.body.occupant === null,
  r.body,
);

r = await call(
  `/api/hierarchy/${orgA}/positions/${officerId}/occupant`,
  json("DELETE", founder.token),
);
check(
  "ending an already-vacant position's occupancy is rejected",
  r.status === 409,
  r.body,
);

// 9. Historical occupancy remains available.
r = await call(
  `/api/hierarchy/${orgA}/positions/${officerId}/occupancy-history`,
  json("GET", founder.token),
);
const officerHistory = r.body.history as
  | Array<{ memberId: number; endsAt: string | null }>
  | undefined;
check(
  "the position's occupancy history keeps both the original and replaced occupants",
  officerHistory?.length === 2 &&
    new Set(officerHistory.map((entry) => entry.memberId)).size === 2,
  officerHistory,
);
check(
  "every history entry for a now-vacant position has ended",
  (officerHistory?.every((entry) => entry.endsAt !== null)) ?? false,
  officerHistory,
);

r = await call(
  `/api/hierarchy/${orgA}/members/${memberIdInA}/occupancy-history`,
  json("GET", founder.token),
);
check(
  "a person's occupancy history spans every position they have held in this organisation",
  r.body.history?.length === 2,
  r.body,
);

// 2 (list). Listing organisation occupancy returns every active occupancy
// at once.
r = await call(`/api/hierarchy/${orgA}/occupancy`, json("GET", founder.token));
check(
  "listing organisation occupancy returns every currently active occupancy",
  Array.isArray(r.body.occupancies) &&
    r.body.occupancies.every((entry: { isActive: boolean }) => entry.isActive),
  r.body,
);

// 17. Department membership remains separate from position occupancy —
// occupancy operations never touch department_members (schema-only on this
// branch — see migration 011; it has no backend yet at all).
const departmentMemberRows = await db("department_members").select("*");
check(
  "occupancy operations never write to department_members",
  departmentMemberRows.length === 0,
  departmentMemberRows,
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

/* ------------------------------------------------------------- teardown */

await db("positions").whereIn("organisation_id", [orgA, orgB]).delete();
await db("organisations").whereIn("id", [orgA, orgB]).delete();
await db("profiles")
  .whereIn("id", [
    founder.id,
    member.id,
    outsider.id,
    member2.id,
    member3.id,
  ])
  .delete();

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
