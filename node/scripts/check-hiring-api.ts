import { db } from "../src/db/knex.js";

/**
 * End-to-end check of the hiring pipeline (V1 completion, Priority 4):
 * Job Posting -> Application -> Review -> Interview -> Offer -> Accept ->
 * Organisation Member -> Position -> Work. Drives the running API over
 * HTTP with throwaway accounts and an organisation, and removes everything
 * it created.
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

const stamp = Date.now();

const founder = await makeUser("Hiring Founder", `hiring-founder${stamp}@example.com`);
const member = await makeUser("Hiring Member", `hiring-member${stamp}@example.com`);
const candidate = await makeUser("Hiring Candidate", `hiring-candidate${stamp}@example.com`);
const otherCandidate = await makeUser("Hiring Other", `hiring-other${stamp}@example.com`);

let r = await call(
  "/api/organisations",
  json("POST", founder.token, { name: `Hiring Org ${stamp}`, type: "company" }),
);
const orgId = r.body.organisation?.id as number;

// A regular (non-admin) member, added directly via the existing invite flow
// (unrelated to hiring — just needed to prove hiring endpoints are
// admin-gated, not member-gated).
r = await call(`/api/organisations/${orgId}/invitations`, json("POST", founder.token, { person: member.email }));
const memberInviteId = r.body.invitation?.id as number;
await call(`/api/organisations/invitations/${memberInviteId}/accept`, json("POST", member.token));

/* -------------------------------------------------------------- position */

r = await call(`/api/hierarchy/${orgId}/positions`, json("POST", founder.token, { name: "Engineer" }));
const positionId = r.body.position?.id as number;

/* ---------------------------------------------------------- job postings */

r = await call(`/api/hiring/${orgId}/postings`, json("POST", member.token, { title: "Should fail" }));
check("a non-admin cannot create a job posting", r.status === 403, r.body);

r = await call(
  `/api/hiring/${orgId}/postings`,
  json("POST", founder.token, { title: `Backend Engineer ${stamp}`, positionId }),
);
check("an admin can create a job posting, defaulting to draft", r.status === 201 && r.body.posting?.status === "draft", r.body);
const postingId = r.body.posting?.id as number;

r = await call(`/api/hiring/${orgId}/postings`, json("GET", candidate.token));
check(
  "a draft posting does not appear in the public listing",
  r.status === 200 && !(r.body.postings ?? []).some((p: { id: number }) => p.id === postingId),
  r.body,
);

r = await call(`/api/hiring/${orgId}/postings/${postingId}`, json("GET", candidate.token));
check("a non-admin cannot view a draft posting directly", r.status === 404, r.status);

r = await call(`/api/hiring/${orgId}/postings/${postingId}/status`, json("POST", founder.token, { status: "open" }));
check("an admin can open the posting", r.status === 200 && r.body.posting?.status === "open", r.body);

r = await call(`/api/hiring/${orgId}/postings`, json("GET", candidate.token));
check(
  "an open posting appears in the public listing to anyone signed in",
  r.status === 200 && (r.body.postings ?? []).some((p: { id: number }) => p.id === postingId),
  r.body,
);

/* ---------------------------------------------------------- application */

r = await call(
  `/api/hiring/${orgId}/postings/${postingId}/applications`,
  json("POST", candidate.token, { coverNote: "I would like to build Yahzel." }),
);
check("a candidate can apply to an open posting", r.status === 201 && r.body.application?.status === "submitted", r.body);
const applicationId = r.body.application?.id as number;

r = await call(
  `/api/hiring/${orgId}/postings/${postingId}/applications`,
  json("POST", candidate.token, { coverNote: "Again." }),
);
check("applying twice to the same posting is rejected", r.status === 409, r.body);

r = await call(`/api/hiring/${orgId}/applications/${applicationId}`, json("GET", otherCandidate.token));
check("an unrelated person cannot read somebody else's application", r.status === 403 || r.status === 404, r.status);

r = await call(`/api/hiring/${orgId}/applications/${applicationId}`, json("GET", candidate.token));
check("the applicant can read their own application", r.status === 200 && r.body.application?.id === applicationId, r.body);

r = await call(`/api/hiring/${orgId}/postings/${postingId}/applications`, json("GET", member.token));
check("a non-admin cannot list applications for a posting", r.status === 403, r.body);

r = await call(`/api/hiring/${orgId}/postings/${postingId}/applications`, json("GET", founder.token));
check(
  "an admin can list applications for a posting",
  r.status === 200 && r.body.applications?.length === 1,
  r.body,
);

/* --------------------------------------------------------------- review */

r = await call(
  `/api/hiring/${orgId}/applications/${applicationId}/review`,
  json("POST", founder.token, { status: "under_review" }),
);
check("an admin can move an application to under_review", r.status === 200 && r.body.application?.status === "under_review", r.body);

/* ------------------------------------------------------------ interview */

r = await call(
  `/api/hiring/${orgId}/applications/${applicationId}/interviews`,
  json("POST", member.token, { notes: "Should fail" }),
);
check("a non-admin cannot schedule an interview", r.status === 403, r.body);

r = await call(
  `/api/hiring/${orgId}/applications/${applicationId}/interviews`,
  json("POST", founder.token, { scheduledAt: new Date(Date.now() + 86400000).toISOString(), notes: "Technical round." }),
);
check("an admin can schedule an interview", r.status === 201 && r.body.interview?.outcome === "pending", r.body);
const interviewId = r.body.interview?.id as number;

r = await call(`/api/hiring/${orgId}/applications/${applicationId}`, json("GET", founder.token));
check("scheduling an interview moves the application to interviewing", r.body.application?.status === "interviewing", r.body.application);

const candidateInterviewNotifs = await db("notifications").where({
  recipient_profile_id: candidate.id,
  type: "hiring.interview_scheduled",
});
check("the candidate was notified of the interview", candidateInterviewNotifs.length >= 1, candidateInterviewNotifs.length);

r = await call(
  `/api/hiring/${orgId}/interviews/${interviewId}`,
  json("PATCH", founder.token, { outcome: "passed" }),
);
check("an admin can record the interview outcome", r.status === 200 && r.body.interview?.outcome === "passed", r.body);

/* ---------------------------------------------------------------- offer */

r = await call(
  `/api/hiring/${orgId}/applications/${applicationId}/offers`,
  json("POST", member.token, {}),
);
check("a non-admin cannot create an offer", r.status === 403, r.body);

r = await call(
  `/api/hiring/${orgId}/applications/${applicationId}/offers`,
  json("POST", founder.token, {
    positionId,
    title: "Backend Engineer",
    participationType: "employee",
    designation: "member",
  }),
);
check("an admin can extend an offer", r.status === 201 && r.body.offer?.status === "pending", r.body);
const offerId = r.body.offer?.id as number;

r = await call(`/api/hiring/${orgId}/applications/${applicationId}`, json("GET", founder.token));
check("extending an offer moves the application to offered", r.body.application?.status === "offered", r.body.application);

r = await call(
  `/api/hiring/${orgId}/applications/${applicationId}/offers`,
  json("POST", founder.token, {}),
);
check("a second open offer on the same application is rejected", r.status === 422, r.body);

/* ------------------------------------------------------- accept -> hired */

r = await call(`/api/hiring/offers/${offerId}/accept`, json("POST", otherCandidate.token));
check("somebody who is not the offer's applicant cannot accept it", r.status === 404, r.status);

r = await call(`/api/hiring/offers/${offerId}/accept`, json("POST", candidate.token));
check(
  "the candidate can accept their offer, becoming a member and taking the position",
  r.status === 200 && r.body.membership?.status === "active" && r.body.occupancyAssigned === true,
  r.body,
);

r = await call(`/api/hiring/${orgId}/applications/${applicationId}`, json("GET", founder.token));
check("accepting the offer marks the application hired", r.body.application?.status === "hired", r.body.application);

r = await call(`/api/organisations/${orgId}`, json("GET", candidate.token));
check(
  "the accepted candidate is now a real organisation member",
  r.status === 200 && r.body.membership?.status === "active",
  r.body,
);

r = await call(`/api/hierarchy/${orgId}/occupancy`, json("GET", founder.token));
const occupancies = (r.body.occupancies ?? r.body.occupancy ?? []) as { positionId: number }[];
check(
  "the hired candidate occupies the position named in the offer",
  Array.isArray(occupancies) && occupancies.some((o) => o.positionId === positionId),
  r.body,
);

const founderHireNotifs = await db("notifications").where({
  recipient_profile_id: founder.id,
  type: "hiring.offer_accepted",
});
check("the hiring admin was notified the offer was accepted", founderHireNotifs.length >= 1, founderHireNotifs.length);

/* ----------------------------------------------------- Work, end to end */

r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgId,
    title: `Hired candidate's first task ${stamp}`,
    assigneeProfileId: candidate.id,
  }),
);
check("the newly hired member can be assigned real Work", r.status === 201 && r.body.workItem?.id > 0, r.body);
const hiredWorkId = r.body.workItem?.id as number;

/* ---------------------------------------------------- decline / withdraw */

r = await call(
  `/api/hiring/${orgId}/postings/${postingId}/applications`,
  json("POST", otherCandidate.token, {}),
);
const otherApplicationId = r.body.application?.id as number;

r = await call(
  `/api/hiring/${orgId}/applications/${otherApplicationId}/offers`,
  json("POST", founder.token, {}),
);
const otherOfferId = r.body.offer?.id as number;

r = await call(`/api/hiring/offers/${otherOfferId}/decline`, json("POST", otherCandidate.token));
check("a candidate can decline an offer", r.status === 200 && r.body.offer?.status === "declined", r.body);

r = await call(`/api/hiring/${orgId}/applications/${otherApplicationId}`, json("GET", founder.token));
check(
  "declining an offer returns the application to under_review, not rejected",
  r.body.application?.status === "under_review",
  r.body.application,
);

r = await call(
  `/api/hiring/${orgId}/applications/${otherApplicationId}/review`,
  json("POST", founder.token, { status: "rejected" }),
);
check("an admin can reject an application", r.status === 200 && r.body.application?.status === "rejected", r.body);

r = await call(
  `/api/hiring/${orgId}/applications/${otherApplicationId}/review`,
  json("POST", founder.token, { status: "under_review" }),
);
check("a decided (rejected) application cannot be reviewed again", r.status === 422, r.body);

/* -------------------------------------------------------- my applications */

r = await call("/api/hiring/applications/mine", json("GET", candidate.token));
check(
  "a candidate can list their own applications across organisations",
  r.status === 200 && r.body.applications?.some((a: { id: number }) => a.id === applicationId),
  r.body,
);

/* ------------------------------------------------------------- teardown */

await db("notifications")
  .where((qb) =>
    qb
      .whereIn("organisation_id", [orgId])
      .orWhereIn("recipient_profile_id", [founder.id, member.id, candidate.id, otherCandidate.id]),
  )
  .delete();
await db("work_items").whereIn("id", [hiredWorkId].filter(Boolean)).delete();
await db("organisations").whereIn("id", [orgId]).delete();
await db("profiles")
  .whereIn("id", [founder.id, member.id, candidate.id, otherCandidate.id])
  .delete();

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
