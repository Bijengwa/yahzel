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

  return { id, email, token: verified.body.token as string };
}

const stamp = Date.now();

const head = await makeUser("Head Person", `head${stamp}@example.com`);
const invitee = await makeUser("Invited Person", `invitee${stamp}@example.com`);
const strangerEmail = `stranger${stamp}@example.com`;

/* ---------------------------------------------------------------- access */

let r = await call("/api/organisations");
check("unauthenticated list is refused", r.status === 401, r.status);

/* ------------------------------------------------------------ validation */

r = await call(
  "/api/organisations",
  json("POST", head.token, { name: "", type: "company" }),
);
check(
  "empty name is rejected on the name field",
  r.status === 422 && r.body.errors?.[0]?.field === "name",
  r.body,
);

r = await call(
  "/api/organisations",
  json("POST", head.token, { name: "Kilimanjaro Works", type: "kingdom" }),
);
check("unknown type is rejected", r.status === 422, r.body);

/* ---------------------------------------------------------- registration */

r = await call(
  "/api/organisations",
  json("POST", head.token, {
    name: `Kilimanjaro Works ${stamp}`,
    type: "company",
    country: "TZ",
    description: "Builds things.",
    headTitle: "Founder & CEO",
  }),
);

const organisationId = r.body.organisation?.id as number;

check(
  "organisation is registered",
  r.status === 201 && !!organisationId,
  r.body,
);

check(
  "registrant is an admin whose designation is head",
  r.body.membership?.systemRole === "admin" &&
    r.body.membership?.designation === "head" &&
    r.body.membership?.status === "active",
  r.body.membership,
);

check(
  "the organisation's own title is kept verbatim",
  r.body.membership?.title === "Founder & CEO",
  r.body.membership,
);

check(
  "nothing is called an owner",
  !JSON.stringify(r.body).toLowerCase().includes("owner"),
  r.body,
);

/* -------------------------------------------------------- participation */

r = await call("/api/organisations", json("GET", head.token));
check(
  "the head sees the organisation in my participation",
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

/* ------------------------------------------------------------ invitation */

r = await call(
  `/api/organisations/${organisationId}/members`,
  json("POST", head.token, {
    email: invitee.email,
    title: "Operations Manager",
    systemRole: "member",
  }),
);
check("an existing person can be invited", r.status === 201, r.body);

check(
  "an invitation carries the organisation's title, not a Yahzel one",
  r.body.member?.title === "Operations Manager" &&
    r.body.member?.designation === "member",
  r.body.member,
);

r = await call(
  `/api/organisations/${organisationId}/members`,
  json("POST", head.token, { email: invitee.email }),
);
check("the same person cannot be invited twice", r.status === 409, r.body);

r = await call(
  `/api/organisations/${organisationId}/members`,
  json("GET", invitee.token),
);
check(
  "an invited person cannot read the people list yet",
  r.status === 403,
  r.status,
);

r = await call("/api/organisations", json("GET", invitee.token));
check(
  "the invitation shows up in the invited person's participation",
  r.body.participation?.[0]?.membership?.status === "invited",
  r.body.participation,
);

r = await call(
  `/api/organisations/${organisationId}/membership/accept`,
  json("POST", invitee.token),
);
check(
  "the invitation can be accepted",
  r.status === 200 && r.body.membership?.status === "active",
  r.body,
);

r = await call(
  `/api/organisations/${organisationId}/members`,
  json("GET", head.token),
);
check(
  "the people list shows the head first, then the member",
  r.body.members?.length === 2 &&
    r.body.members[0].designation === "head" &&
    r.body.members[1].status === "active",
  r.body.members,
);

/* -------------------------------------------------------- administration */

r = await call(
  `/api/organisations/${organisationId}/members`,
  json("POST", invitee.token, { email: strangerEmail }),
);
check("a plain member cannot invite", r.status === 403, r.status);

const headMember = (await db("organisation_members")
  .where({ organisation_id: organisationId, designation: "head" })
  .first()) as { id: number };

r = await call(
  `/api/organisations/${organisationId}/members/${headMember.id}`,
  json("DELETE", head.token),
);
check("the head cannot be removed", r.status === 409, r.body);

/* ------------------------------- inviting somebody who has no account yet */

r = await call(
  `/api/organisations/${organisationId}/members`,
  json("POST", head.token, { email: strangerEmail }),
);
check(
  "an address with no Yahzel account can still be invited",
  r.status === 201 && r.body.member?.profileId === null,
  r.body.member,
);

const stranger = await makeUser("Stranger Person", strangerEmail);

r = await call("/api/organisations", json("GET", stranger.token));
check(
  "the waiting invitation finds them once they join Yahzel",
  r.body.participation?.[0]?.membership?.status === "invited",
  r.body.participation,
);

r = await call(
  `/api/organisations/${organisationId}/membership/decline`,
  json("POST", stranger.token),
);
check("an invitation can be declined", r.status === 200, r.body);

r = await call("/api/organisations", json("GET", stranger.token));
check(
  "a declined invitation disappears",
  r.body.participation?.length === 0,
  r.body.participation,
);

/* ------------------------------------------------------------- teardown */

// Organisations first: organisations.created_by is ON DELETE RESTRICT.
await db("organisations").where({ id: organisationId }).delete();
await db("profiles").whereIn("id", [head.id, invitee.id, stranger.id]).delete();

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
