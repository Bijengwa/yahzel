import { db } from "../src/db/knex.js";

/**
 * End-to-end check of Phase 6 (Organizational Intelligence & Operational
 * Memory), in the style of check-projects-phase5-api.ts: drives the running
 * API over HTTP with throwaway accounts and organisations, and removes
 * everything it created.
 *
 * Start the API first:  npm run dev
 */

const API = process.env.CHECK_API_URL ?? "http://localhost:5000";
let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : `  -> ${JSON.stringify(detail)}`}`);
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
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  };
}

async function makeUser(fullName: string, email: string) {
  const reg = await call("/api/auth/register", json("POST", null, { fullName, email, password: "password123", confirmPassword: "password123" }));
  const id = reg.body.user.id as number;
  const row = await db("profiles").where({ id }).first();
  const verified = await call("/api/auth/verify", json("POST", null, { userId: id, otp: row.verification_otp }));
  return { id, fullName, email, token: verified.body.token as string };
}

async function addActiveMember(organisationId: number, adminToken: string, person: { id: number; email: string; token: string }) {
  const invite = await call(`/api/organisations/${organisationId}/invitations`, json("POST", adminToken, { person: person.email }));
  const invitationId = invite.body.invitation?.id as number;
  await call(`/api/organisations/invitations/${invitationId}/accept`, json("POST", person.token));
}

const stamp = Date.now();

const founder = await makeUser("P6 Founder", `p6-founder${stamp}@example.com`);
const alice = await makeUser("P6 Alice", `p6-alice${stamp}@example.com`);
const bob = await makeUser("P6 Bob", `p6-bob${stamp}@example.com`);
const outsider = await makeUser("P6 Outsider", `p6-outsider${stamp}@example.com`);

let r = await call("/api/organisations", json("POST", founder.token, { name: `P6 Org A ${stamp}`, type: "company" }));
const orgA = r.body.organisation?.id as number;

r = await call("/api/organisations", json("POST", outsider.token, { name: `P6 Org B ${stamp}`, type: "company" }));
const orgB = r.body.organisation?.id as number;

await addActiveMember(orgA, founder.token, alice);
await addActiveMember(orgA, founder.token, bob);

const createdWorkIds: number[] = [];
const createdProjectIds: number[] = [];

/* ============================================================ AUTHORIZATION */

r = await call(`/api/intelligence/${orgA}/overview`, json("GET", alice.token));
check("a non-admin active member cannot read the overview", r.status === 403, r.body);

r = await call(`/api/intelligence/${orgA}/overview`, json("GET", outsider.token));
check("a non-member cannot read the overview (reads as not found)", r.status === 404, r.status);

r = await call(`/api/intelligence/${orgA}/attention`, json("GET", outsider.token));
check("a non-member cannot read attention", r.status === 404, r.status);

/* =========================================================== FIXTURE SETUP */

r = await call(`/api/projects/${orgA}`, json("POST", founder.token, { name: `Intel Project ${stamp}` }));
const project = r.body.project;
createdProjectIds.push(project.id);
await call(`/api/projects/${orgA}/${project.id}/status`, json("POST", founder.token, { status: "active" }));

r = await call(`/api/projects/${orgA}/${project.id}/outcomes`, json("POST", founder.token, {
  title: "Overdue outcome",
  targetDate: new Date(Date.now() - 5 * 86_400_000).toISOString(),
}));
const overdueOutcome = r.body.outcome;

r = await call("/api/work", json("POST", founder.token, {
  organisationId: orgA, title: `Overdue work ${stamp}`, assigneeProfileId: alice.id, projectId: project.id,
  dueAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
}));
const overdueWork = r.body.workItem.id as number;
createdWorkIds.push(overdueWork);

r = await call("/api/work", json("POST", founder.token, { organisationId: orgA, title: `Blocked work ${stamp}`, assigneeProfileId: bob.id, projectId: project.id }));
const blockedWork = r.body.workItem.id as number;
createdWorkIds.push(blockedWork);
await call(`/api/work/${blockedWork}`, json("PATCH", founder.token, { status: "blocked", blockedReason: "waiting_approval" }));

r = await call("/api/work", json("POST", founder.token, { organisationId: orgA, title: `Stalled work ${stamp}`, assigneeProfileId: alice.id, projectId: project.id }));
const stalledWork = r.body.workItem.id as number;
createdWorkIds.push(stalledWork);
await db("work_items").where({ id: stalledWork }).update({ last_activity_at: db.raw("now() - interval '20 days'") });

r = await call("/api/work", json("POST", founder.token, { organisationId: orgA, title: `Done work ${stamp}`, assigneeProfileId: alice.id, projectId: project.id }));
const doneWork = r.body.workItem.id as number;
createdWorkIds.push(doneWork);
await call(`/api/work/${doneWork}`, json("PATCH", founder.token, { status: "done", progress: 100 }));

// A member with an expiring contract, via the employment/contract flow.
r = await call(`/api/organisations/${orgA}/members`, json("GET", founder.token));
const aliceMembership = (r.body.members as { profileId: number | null; id: number }[]).find((m) => m.profileId === alice.id);
const aliceMemberId = aliceMembership!.id as number;

await call(`/api/employment/${orgA}/members/${aliceMemberId}`, json("POST", founder.token, {
  employmentStatus: "active",
  startDate: new Date(Date.now() - 200 * 86_400_000).toISOString(),
}));
r = await call(`/api/employment/${orgA}/members/${aliceMemberId}`, json("GET", founder.token));
const employmentRecordId = r.body.employmentRecord.id as number;

await call(`/api/employment/${orgA}/${employmentRecordId}/contracts`, json("POST", founder.token, {
  contractType: "fixed_term",
  startDate: new Date(Date.now() - 200 * 86_400_000).toISOString(),
  endDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
  status: "active",
}));

/* ================================================================ ATTENTION */

r = await call(`/api/intelligence/${orgA}/attention`, json("GET", founder.token));
check("the admin can read attention", r.status === 200, r.body);
const attentionTypes = (r.body.attention as { type: string }[]).map((a) => a.type);
check("work.overdue is detected", attentionTypes.includes("work.overdue"), attentionTypes);
check("work.blocked is detected", attentionTypes.includes("work.blocked"), attentionTypes);
check("work.stalled is detected", attentionTypes.includes("work.stalled"), attentionTypes);
check("outcome.overdue is detected", attentionTypes.includes("outcome.overdue"), attentionTypes);
check("contract.expiring is detected", attentionTypes.includes("contract.expiring"), attentionTypes);
check(
  "no performance score leaks into an attention item",
  r.body.attention.every((a: Record<string, unknown>) => !("score" in a) && !("rating" in a) && !("ranking" in a)),
  r.body.attention,
);

const overdueSignal = (r.body.attention as { id: number; type: string; entityId: number }[]).find(
  (a) => a.type === "work.overdue" && a.entityId === overdueWork,
);
check("the overdue-work signal references the right work item", Boolean(overdueSignal), r.body.attention);

/* --- idempotency: re-scanning does not duplicate or re-notify --- */
const beforeScanCount = r.body.attention.length as number;
r = await call(`/api/intelligence/${orgA}/attention/scan`, json("POST", founder.token));
check("scanning again is safe (POST /scan succeeds)", r.status === 200, r.body);
r = await call(`/api/intelligence/${orgA}/attention`, json("GET", founder.token));
check("re-scanning does not duplicate active signals", r.body.attention.length === beforeScanCount, {
  before: beforeScanCount,
  after: r.body.attention.length,
});

/* --- resolve: manual resolution removes it from the active list and stays gone --- */
r = await call(`/api/intelligence/${orgA}/attention/${overdueSignal!.id}/resolve`, json("POST", founder.token));
check("the admin can resolve an attention item", r.status === 200 && r.body.attention?.status === "resolved", r.body);

r = await call(`/api/intelligence/${orgA}/attention`, json("GET", founder.token));
const typesAfterResolve = (r.body.attention as { id: number }[]).map((a) => a.id);
check("a resolved item no longer appears as active", !typesAfterResolve.includes(overdueSignal!.id), typesAfterResolve);

// Re-scan again: the still-true condition must NOT reopen a manually resolved signal (sticky resolution).
await call(`/api/intelligence/${orgA}/attention/scan`, json("POST", founder.token));
r = await call(`/api/intelligence/${orgA}/attention`, json("GET", founder.token));
const stillGone = !(r.body.attention as { id: number }[]).map((a) => a.id).includes(overdueSignal!.id);
check("resolution is sticky across a later scan of the same still-true condition", stillGone, r.body.attention);

/* ================================================================= OVERVIEW */

r = await call(`/api/intelligence/${orgA}/overview`, json("GET", founder.token));
check("overview loads", r.status === 200, r.body);
check("overview counts active people", r.body.people?.activeMembers >= 3, r.body.people);
check("overview counts work totals", r.body.work?.total >= 4 && r.body.work?.completed >= 1, r.body.work);
check("overview reports blocked/overdue/stalled work", r.body.work?.blocked >= 1 && r.body.work?.stalled >= 1, r.body.work);
check("overview counts outcomes", r.body.outcomes?.total >= 1 && r.body.outcomes?.overdue >= 1, r.body.outcomes);
check("overview attention byType is present, not a score", typeof r.body.attention?.byType === "object", r.body.attention);
check(
  "overview never introduces a productivity/ranking field",
  !("productivity" in r.body) && !("ranking" in r.body) && !("leaderboard" in r.body),
  Object.keys(r.body),
);

/* ================================================================= ACTIVITY */

r = await call(`/api/intelligence/${orgA}/activity`, json("GET", founder.token));
check("activity loads", r.status === 200 && Array.isArray(r.body.activity), r.body);
const activityTypes = (r.body.activity as { type: string }[]).map((a) => a.type);
check("activity includes a member joining", activityTypes.includes("member.joined"), activityTypes);
check("activity includes work creation", activityTypes.includes("work.created"), activityTypes);
check("activity includes a project event", activityTypes.some((t) => t.startsWith("project.")), activityTypes);

const occurredTimes = (r.body.activity as { occurredAt: string }[]).map((a) => new Date(a.occurredAt).getTime());
const sorted = [...occurredTimes].sort((a, b) => b - a);
check("activity is ordered newest first", JSON.stringify(occurredTimes) === JSON.stringify(sorted), occurredTimes.slice(0, 5));

/* =============================================================== PERSON HISTORY */

r = await call(`/api/intelligence/${orgA}/members/${aliceMemberId}/history`, json("GET", founder.token));
check("member history loads", r.status === 200, r.body);
check("member history includes the membership record", r.body.membership?.id === aliceMemberId, r.body.membership);
check("member history includes employment/contract history", r.body.employment?.length >= 1 && r.body.employment[0].contracts.length >= 1, r.body.employment);
check(
  "member history includes work items alice is connected to",
  (r.body.work?.items as { id: number }[]).some((w) => [overdueWork, stalledWork, doneWork].includes(w.id)),
  r.body.work,
);
check(
  "member history never invents a skills or rating field",
  !("skills" in r.body) && !("rating" in r.body) && !("performanceScore" in r.body),
  Object.keys(r.body),
);

r = await call(`/api/intelligence/${orgA}/members/${aliceMemberId}/history`, json("GET", alice.token));
check("a non-admin member cannot read another person's operational history", r.status === 403, r.body);

r = await call(`/api/intelligence/${orgB}/members/${aliceMemberId}/history`, json("GET", outsider.token));
check("a member id from another organisation is not found there", r.status === 404 || r.status === 403, r.status);

/* =================================================================== SEARCH */

r = await call(`/api/intelligence/${orgA}/search?q=${encodeURIComponent("Overdue")}`, json("GET", founder.token));
check("search finds the overdue work item and outcome by title", r.status === 200, r.body);
const searchWorkTitles = (r.body.results?.work as { title: string }[]).map((w) => w.title);
const searchOutcomeTitles = (r.body.results?.outcomes as { title: string }[]).map((o) => o.title);
check("search results include the overdue work item", searchWorkTitles.some((t) => t.includes("Overdue work")), searchWorkTitles);
check("search results include the overdue outcome", searchOutcomeTitles.includes(overdueOutcome.title), searchOutcomeTitles);

r = await call(`/api/intelligence/${orgA}/search?q=a`, json("GET", founder.token));
check("a too-short query returns empty results rather than everything", Object.values(r.body.results ?? {}).every((v: unknown) => Array.isArray(v) && v.length === 0), r.body);

r = await call(`/api/intelligence/${orgB}/search?q=Overdue`, json("GET", outsider.token));
const crossOrgWork = (r.body.results?.work as { title: string }[] ?? []).some((w) => w.title.includes("Overdue work"));
check("search never returns another organisation's records", !crossOrgWork, r.body.results?.work);

/* --------------------------------------------------------------- teardown */

await db("operational_signals").whereIn("organisation_id", [orgA, orgB]).delete();
await db("notifications").where((qb) => qb.whereIn("organisation_id", [orgA, orgB]).orWhereIn("recipient_profile_id", [founder.id, alice.id, bob.id, outsider.id])).delete();
await db("contracts").where({ organisation_id: orgA }).delete();
await db("employment_records").where({ organisation_id: orgA }).delete();
await db("work_items").whereIn("id", createdWorkIds).delete();
await db("organisations").whereIn("id", [orgA, orgB]).delete();
await db("profiles").whereIn("id", [founder.id, alice.id, bob.id, outsider.id]).delete();

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
await db.destroy();
process.exit(failures === 0 ? 0 : 1);
