import { db } from "../src/db/knex.js";

/**
 * End-to-end check of CV/Portfolio (V1 completion, Priority 2), in the style
 * of the other check-*-api.ts scripts: drives the running API over HTTP with
 * throwaway accounts and an organisation, and removes everything it created.
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

  await call(`/api/organisations/invitations/${invitationId}/accept`, json("POST", person.token));
}

const stamp = Date.now();

const owner = await makeUser("CV Owner", `cv-owner${stamp}@example.com`);
const colleague = await makeUser("CV Colleague", `cv-colleague${stamp}@example.com`);
const outsider = await makeUser("CV Outsider", `cv-outsider${stamp}@example.com`);

let r = await call(
  "/api/organisations",
  json("POST", owner.token, { name: `CV Org ${stamp}`, type: "company" }),
);
const orgA = r.body.organisation?.id as number;

await addActiveMember(orgA, owner.token, colleague);

/* -------------------------------------------------------------- skills */

r = await call("/api/profile/skills", json("GET", owner.token));
check("skills start empty", r.status === 200 && r.body.skills?.length === 0, r.body);

r = await call("/api/profile/skills", json("POST", owner.token, { name: "TypeScript" }));
check("a skill can be added", r.status === 201 && r.body.skill?.name === "TypeScript", r.body);
const skillId = r.body.skill?.id as number;

r = await call("/api/profile/skills", json("POST", owner.token, { name: "typescript" }));
check("a duplicate skill (case-insensitive) is rejected", r.status === 422, r.body);

r = await call("/api/profile/skills", json("POST", owner.token, { name: "" }));
check("an empty skill is rejected", r.status === 422, r.body);

/* ----------------------------------------------------------- education */

r = await call(
  "/api/profile/education",
  json("POST", owner.token, {
    institution: "Yahzel University",
    degree: "BSc Computer Science",
    startDate: "2018-01-01",
    endDate: "2022-01-01",
  }),
);
check("education can be added", r.status === 201 && r.body.education?.institution === "Yahzel University", r.body);
const educationId = r.body.education?.id as number;

r = await call(
  "/api/profile/education",
  json("POST", owner.token, {
    institution: "Bad Dates U",
    startDate: "2022-01-01",
    endDate: "2018-01-01",
  }),
);
check("an end date before the start date is rejected", r.status === 422, r.body);

/* ------------------------------------------------------- certifications */

r = await call(
  "/api/profile/certifications",
  json("POST", owner.token, {
    name: "Certified Yahzel Professional",
    issuingOrganisation: "Yahzel",
    credentialUrl: "https://example.com/cred/123",
  }),
);
check(
  "a certification can be added",
  r.status === 201 && r.body.certification?.name === "Certified Yahzel Professional",
  r.body,
);
const certificationId = r.body.certification?.id as number;

r = await call(
  "/api/profile/certifications",
  json("POST", owner.token, { name: "Bad URL Cert", credentialUrl: "not-a-url" }),
);
check("an invalid credential URL is rejected", r.status === 422, r.body);

/* ------------------------------------------------------- headline/summary */

r = await call(
  "/api/profile",
  json("PATCH", owner.token, {
    headline: "Backend Engineer",
    summary: "I build verified professional records.",
  }),
);
check(
  "headline and summary save through the profile endpoint",
  r.status === 200 && r.body.profile?.headline === "Backend Engineer",
  r.body,
);

/* ---------------------------------------------------- verified work item */

r = await call(
  "/api/work",
  json("POST", owner.token, {
    organisationId: orgA,
    title: `CV Verified Work ${stamp}`,
    assigneeProfileId: owner.id,
  }),
);
const cvWork = r.body.workItem?.id as number;

r = await call(`/api/work/${cvWork}/reports`, json("POST", owner.token, { body: "Delivered the thing.", submit: true }));
const cvReport = r.body.report?.id as number;

r = await call(`/api/work/${cvWork}/reports/${cvReport}/accept`, json("POST", owner.token));
check("the report is accepted (verified)", r.status === 200 && r.body.report?.state === "accepted", r.body);

// A second, unverified work item — must never surface as CV/portfolio work.
r = await call(
  "/api/work",
  json("POST", owner.token, {
    organisationId: orgA,
    title: `CV Unverified Work ${stamp}`,
    assigneeProfileId: owner.id,
  }),
);
const unverifiedWork = r.body.workItem?.id as number;

/* -------------------------------------------------------------------- CV */

r = await call(`/api/profiles/${owner.id}/cv`, json("GET", owner.token));
check("the owner can read their own CV", r.status === 200 && r.body.cv?.profile?.id === owner.id, r.body);
check(
  "the CV includes the skill",
  r.body.cv?.skills?.some((s: { name: string }) => s.name === "TypeScript"),
  r.body.cv?.skills,
);
check(
  "the CV includes the education entry",
  r.body.cv?.education?.some((e: { institution: string }) => e?.institution === "Yahzel University"),
  r.body.cv?.education,
);
check(
  "the CV includes the certification",
  r.body.cv?.certifications?.some((c: { name: string }) => c?.name === "Certified Yahzel Professional"),
  r.body.cv?.certifications,
);
check(
  "the CV includes the verified work item",
  r.body.cv?.verifiedWork?.some((w: { workItemId: number }) => w.workItemId === cvWork),
  r.body.cv?.verifiedWork,
);
check(
  "the CV never includes the unverified work item",
  !r.body.cv?.verifiedWork?.some((w: { workItemId: number }) => w.workItemId === unverifiedWork),
  r.body.cv?.verifiedWork,
);
check(
  "the CV includes organisation experience",
  r.body.cv?.experience?.some((e: { organisationId: number }) => e.organisationId === orgA),
  r.body.cv?.experience,
);

r = await call(`/api/profiles/${owner.id}/cv`, json("GET", outsider.token));
check("a private CV is not visible to an unrelated person", r.status === 404, r.status);

r = await call(`/api/profiles/${owner.id}/cv`, json("GET", colleague.token));
check("a private CV is not visible to an org colleague either (default is private)", r.status === 404, r.status);

/* ------------------------------------------------------------ export */

r = await call(`/api/profiles/${owner.id}/cv/export`, json("POST", owner.token, { format: "markdown" }));
check(
  "the owner can export their CV as markdown",
  r.status === 200 && typeof r.body.content === "string" && r.body.content.includes("TypeScript"),
  { status: r.status, hasContent: typeof r.body.content },
);

r = await call(`/api/profiles/${owner.id}/cv/export`, json("POST", owner.token, { format: "pdf" }));
check("an unsupported export format is rejected, not silently ignored", r.status === 422, r.body);

/* --------------------------------------------------- portfolio settings */

r = await call(`/api/profiles/${owner.id}/portfolio/settings`, json("GET", colleague.token));
check("a non-owner cannot read portfolio settings", r.status === 403, r.body);

r = await call(`/api/profiles/${owner.id}/portfolio/settings`, json("GET", owner.token));
check(
  "the owner can read their portfolio settings, defaulted to private",
  r.status === 200 && r.body.settings?.visibility === "private",
  r.body,
);

r = await call(
  `/api/profiles/${owner.id}/portfolio/settings`,
  json("PATCH", owner.token, { featuredWorkItemIds: [unverifiedWork] }),
);
check("featuring unverified work is rejected", r.status === 422, r.body);

r = await call(
  `/api/profiles/${owner.id}/portfolio/settings`,
  json("PATCH", colleague.token, { visibility: "public" }),
);
check("a non-owner cannot change portfolio settings", r.status === 403, r.body);

r = await call(
  `/api/profiles/${owner.id}/portfolio/settings`,
  json("PATCH", owner.token, { visibility: "organisation", featuredWorkItemIds: [cvWork] }),
);
check(
  "the owner can set visibility to organisation and feature verified work",
  r.status === 200 &&
    r.body.settings?.visibility === "organisation" &&
    r.body.settings?.featuredWorkItemIds?.includes(cvWork),
  r.body,
);

r = await call(`/api/profiles/${owner.id}/portfolio`, json("GET", colleague.token));
check(
  "an org colleague can now view the portfolio (organisation visibility)",
  r.status === 200 && r.body.portfolio?.featuredWork?.some((w: { workItemId: number }) => w.workItemId === cvWork),
  r.body,
);

r = await call(`/api/profiles/${owner.id}/portfolio`, json("GET", outsider.token));
check("an unrelated person still cannot view an organisation-visibility portfolio", r.status === 404, r.status);

r = await call(
  `/api/profiles/${owner.id}/portfolio/settings`,
  json("PATCH", owner.token, { visibility: "public" }),
);
check("the owner can set visibility to public", r.status === 200 && r.body.settings?.visibility === "public", r.body);

r = await call(`/api/profiles/${owner.id}/portfolio`, json("GET", outsider.token));
check(
  "a public portfolio is visible to any signed-in person",
  r.status === 200 && r.body.portfolio?.profile?.id === owner.id,
  r.body,
);
check(
  "a public portfolio never exposes contact details",
  r.body.portfolio?.profile?.email === undefined && r.body.portfolio?.profile?.phoneNumber === undefined,
  r.body.portfolio?.profile,
);

/* --------------------------------------------------------------- delete */

r = await call("/api/profile/skills/" + skillId, json("DELETE", owner.token));
check("a skill can be removed", r.status === 200, r.body);

r = await call(`/api/profile/education/${educationId}`, json("DELETE", owner.token));
check("an education entry can be removed", r.status === 200, r.body);

r = await call(`/api/profile/certifications/${certificationId}`, json("DELETE", owner.token));
check("a certification can be removed", r.status === 200, r.body);

/* ------------------------------------------------------------- teardown */

const workIds = [cvWork, unverifiedWork].filter(Boolean);
await db("notifications").whereIn("work_item_id", workIds).delete();
await db("work_items").whereIn("id", workIds).delete();
await db("organisations").whereIn("id", [orgA]).delete();
await db("profiles").whereIn("id", [owner.id, colleague.id, outsider.id]).delete();

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
