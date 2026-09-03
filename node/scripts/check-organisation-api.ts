import { db } from "../src/db/knex.js";

/**
 * End-to-end check of the Organisation area, in the style of
 * check-profile-api.ts: it drives the running API over HTTP with throwaway
 * accounts and removes everything it created.
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

  return {
    id,
    email,
    username: reg.body.user.username as string,
    token: verified.body.token as string,
  };
}

const stamp = Date.now();

const founder = await makeUser("Founder Person", `founder${stamp}@example.com`);
const invitee = await makeUser("Invited Person", `invitee${stamp}@example.com`);
const strangerEmail = `stranger${stamp}@example.com`;

/* ---------------------------------------------------------------- access */

let r = await call("/api/organisations");
check("unauthenticated list is refused", r.status === 401, r.status);

/* ------------------------------------------------------------ validation */

r = await call(
  "/api/organisations",
  json("POST", founder.token, { name: "", type: "company" }),
);
check(
  "empty name is rejected on the name field",
  r.status === 422 && r.body.errors?.[0]?.field === "name",
  r.body,
);

r = await call(
  "/api/organisations",
  json("POST", founder.token, { name: "Kilimanjaro Works", type: "kingdom" }),
);
check("unknown type is rejected", r.status === 422, r.body);

/* ---------------------------------------------------------- registration */

r = await call(
  "/api/organisations",
  json("POST", founder.token, {
    name: `Kilimanjaro Works ${stamp}`,
    type: "company",
    country: "TZ",
    description: "Builds things.",
    title: "Founder & CEO",
    participationType: "employee",
  }),
);

const organisationId = r.body.organisation?.id as number;

check(
  "organisation is registered",
  r.status === 201 && !!organisationId,
  r.body,
);

check(
  "the registrant is an admin — a Yahzel access role",
  r.body.membership?.systemRole === "admin" &&
    r.body.membership?.status === "active",
  r.body.membership,
);

check(
  "the registrant is NOT made the head, and is not put in Administration",
  r.body.membership?.isHead === false &&
    r.body.membership?.isAdministration === false,
  r.body.membership,
);

check(
  "the organisation's own title is kept verbatim",
  r.body.membership?.title === "Founder & CEO",
  r.body.membership,
);

check(
  "the membership timeline starts, and has no invented end",
  !!r.body.membership?.joinedAt && r.body.membership?.leftAt === null,
  r.body.membership,
);

check(
  "nothing is called an owner",
  !JSON.stringify(r.body).toLowerCase().includes("owner"),
  r.body,
);

/* -------------------------------------------------------- participation */

r = await call("/api/organisations", json("GET", founder.token));
check(
  "the registrant sees the organisation in my participation",
  r.body.participation?.length === 1 &&
    r.body.participation[0].organisation.id === organisationId &&
    r.body.participation[0].organisation.typeLabel === "Company" &&
    r.body.participation[0].organisation.countryName === "Tanzania",
  r.body.participation,
);

r = await call(
  `/api/organisations/${organisationId}`,
  json("GET", invitee.token),
);
check(
  "a non-member is not told the organisation exists",
  r.status === 404,
  r.status,
);

/* ------------------------------------------- Administration is not Admin */

const founderMembership = (await db("organisation_members")
  .where({ organisation_id: organisationId, profile_id: founder.id })
  .first()) as { id: number };

r = await call(
  `/api/organisations/${organisationId}/members/${founderMembership.id}`,
  json("PATCH", founder.token, {
    organisationClass: "member",
    designation: "head",
  }),
);
check(
  "head cannot be held outside the Administration class",
  r.status === 422 && r.body.errors?.[0]?.field === "designation",
  r.body,
);

r = await call(
  `/api/organisations/${organisationId}/members/${founderMembership.id}`,
  json("PATCH", founder.token, {
    organisationClass: "administration",
    designation: "head",
  }),
);
check(
  "head is assigned deliberately, afterwards",
  r.status === 200 &&
    r.body.membership?.isHead === true &&
    r.body.membership?.isAdministration === true,
  r.body,
);

/* ------------------------------------------------------------ invitation */

r = await call(
  `/api/organisations/${organisationId}/invitations`,
  json("POST", founder.token, {
    person: invitee.username,
    title: "Operations Manager",
    participationType: "contractor",
  }),
);
check("a person can be invited by username", r.status === 201, r.body);

const invitationId = r.body.invitation?.id as number;

check(
  "an invitation carries the organisation's title, not a Yahzel one",
  r.body.invitation?.title === "Operations Manager" &&
    r.body.invitation?.participationType === "contractor",
  r.body.invitation,
);

check(
  "the invitation says who is asking, and names Admin as an access role",
  r.body.invitation?.invitedBy?.systemRole === "admin",
  r.body.invitation?.invitedBy,
);

r = await call(
  `/api/organisations/${organisationId}/invitations`,
  json("POST", founder.token, { person: invitee.email }),
);
check("the same person cannot be invited twice", r.status === 409, r.body);

r = await call(
  `/api/organisations/${organisationId}/members`,
  json("GET", invitee.token),
);
check("an invited person is not a member yet", r.status === 404, r.status);

r = await call("/api/organisations/invitations", json("GET", invitee.token));
check(
  "the invitation is waiting for the invited person",
  r.body.invitations?.[0]?.id === invitationId,
  r.body.invitations,
);

r = await call(
  `/api/organisations/invitations/${invitationId}/accept`,
  json("POST", invitee.token),
);
check(
  "accepting is what creates the membership",
  r.status === 200 &&
    r.body.membership?.status === "active" &&
    r.body.membership?.title === "Operations Manager",
  r.body,
);

r = await call(
  `/api/organisations/${organisationId}/members`,
  json("GET", founder.token),
);
check(
  "people are grouped into Administration and everybody else",
  r.body.administration?.length === 1 &&
    r.body.administration[0].isHead === true &&
    r.body.people?.length === 1,
  { administration: r.body.administration, people: r.body.people },
);

/* -------------------------------------------------------- administration */

r = await call(
  `/api/organisations/${organisationId}/invitations`,
  json("POST", invitee.token, { person: strangerEmail }),
);
check("a plain member cannot invite", r.status === 403, r.status);

/* ------------------------------- inviting somebody who has no account yet */

r = await call(
  `/api/organisations/${organisationId}/invitations`,
  json("POST", founder.token, {
    person: strangerEmail,
    participationType: "volunteer",
    title: "Community Volunteer",
  }),
);
check(
  "an address with no Yahzel account can still be invited",
  r.status === 201 && r.body.invitation?.profileId === null,
  r.body.invitation,
);

const strangerInvitationId = r.body.invitation?.id as number;

const stranger = await makeUser("Stranger Person", strangerEmail);

r = await call("/api/organisations/invitations", json("GET", stranger.token));
check(
  "registering attaches the waiting invitation without accepting it",
  r.body.invitations?.[0]?.id === strangerInvitationId &&
    r.body.invitations?.[0]?.status === "pending",
  r.body.invitations,
);

r = await call("/api/organisations", json("GET", stranger.token));
check(
  "an unanswered invitation is not a membership",
  r.body.participation?.length === 0,
  r.body.participation,
);

r = await call(
  `/api/organisations/invitations/${strangerInvitationId}/decline`,
  json("POST", stranger.token),
);
check("an invitation can be declined", r.status === 200, r.body);

r = await call("/api/organisations/invitations", json("GET", stranger.token));
check(
  "a declined invitation stops waiting, but is not deleted",
  r.body.invitations?.length === 0,
  r.body.invitations,
);

check(
  "the declined invitation is kept as history",
  (
    (await db("organisation_invitations")
      .where({ id: strangerInvitationId })
      .first()) as { status: string }
  )?.status === "declined",
  strangerInvitationId,
);

/* ------------------------------------------- concluding, never deleting */

const inviteeMembership = (await db("organisation_members")
  .where({ organisation_id: organisationId, profile_id: invitee.id })
  .first()) as { id: number };

r = await call(
  `/api/organisations/${organisationId}/members/${inviteeMembership.id}`,
  json("DELETE", founder.token),
);
check(
  "ending a membership concludes it and closes its timeline",
  r.status === 200 &&
    r.body.membership?.status === "concluded" &&
    !!r.body.membership?.leftAt,
  r.body,
);

r = await call("/api/organisations", json("GET", invitee.token));
check(
  "a concluded membership stays in the person's history",
  r.body.participation?.[0]?.membership?.status === "concluded",
  r.body.participation,
);

/* --------------------------------------------------- V1: org settings */

r = await call(`/api/organisations/${organisationId}`, json("PATCH", stranger.token, { name: "Hijacked" }));
check("a non-member cannot update organisation settings", r.status === 403 || r.status === 404, r.status);

r = await call(
  `/api/organisations/${organisationId}`,
  json("PATCH", founder.token, { name: "Renamed Org", description: "A new description." }),
);
check(
  "an admin can rename the organisation and edit its description",
  r.status === 200 && r.body.organisation?.name === "Renamed Org" && r.body.organisation?.description === "A new description.",
  r.body,
);

r = await call(`/api/organisations/${organisationId}`, json("PATCH", founder.token, { name: "" }));
check("an empty organisation name is rejected", r.status === 422, r.body);

/* ------------------------------------------------------------- teardown */

// Organisations first: organisations.created_by is ON DELETE RESTRICT, and
// invitations and memberships cascade from the organisation.
await db("organisations").where({ id: organisationId }).delete();
await db("profiles")
  .whereIn("id", [founder.id, invitee.id, stranger.id])
  .delete();

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
