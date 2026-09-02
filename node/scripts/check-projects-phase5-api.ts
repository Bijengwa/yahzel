import { db } from "../src/db/knex.js";

/**
 * End-to-end check of Phase 5 (Projects & operational coordination), in the
 * style of check-work-phase4-api.ts: it drives the running API over HTTP
 * with throwaway accounts and organisations, and removes everything it
 * created.
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

  await call(
    `/api/organisations/invitations/${invitationId}/accept`,
    json("POST", person.token),
  );
}

const stamp = Date.now();

const founder = await makeUser("P5 Founder", `p5-founder${stamp}@example.com`);
const alice = await makeUser("P5 Alice", `p5-alice${stamp}@example.com`);
const bob = await makeUser("P5 Bob", `p5-bob${stamp}@example.com`);
const carol = await makeUser("P5 Carol", `p5-carol${stamp}@example.com`);
const outsider = await makeUser("P5 Outsider", `p5-outsider${stamp}@example.com`);

let r = await call(
  "/api/organisations",
  json("POST", founder.token, { name: `P5 Org A ${stamp}`, type: "company" }),
);
const orgA = r.body.organisation?.id as number;

r = await call(
  "/api/organisations",
  json("POST", outsider.token, { name: `P5 Org B ${stamp}`, type: "company" }),
);
const orgB = r.body.organisation?.id as number;

await addActiveMember(orgA, founder.token, alice);
await addActiveMember(orgA, founder.token, bob);
await addActiveMember(orgA, founder.token, carol);

const createdProjectIds: number[] = [];
const createdWorkIds: number[] = [];

/* ===================================================== PROJECT CREATION */

r = await call(`/api/projects/${orgA}`, json("POST", alice.token, { name: "" }));
check("empty name is rejected", r.status === 422 && r.body.errors?.[0]?.field === "name", r.body);

r = await call(
  `/api/projects/${orgA}`,
  json("POST", alice.token, { name: `Website Revamp ${stamp}`, description: "Redo the site" }),
);
check(
  "any active member can create a project, defaulting to owning it themselves",
  r.status === 201 && r.body.project?.ownerProfileId === alice.id && r.body.project?.status === "planned",
  r.body,
);
const websiteProject = r.body.project;
createdProjectIds.push(websiteProject.id);

r = await call(`/api/projects/${orgB}`, json("POST", outsider.token, { name: "Should not cross" }));
const crossOrgProbe = r.body.project?.id as number | undefined;

r = await call(
  `/api/projects/${orgA}`,
  json("POST", outsider.token, { name: "Hijack attempt" }),
);
check("a non-member cannot create a project in another org", r.status === 404, r.status);

r = await call(
  `/api/projects/${orgA}`,
  json("POST", founder.token, { name: `Owned by Bob ${stamp}`, ownerProfileId: bob.id }),
);
check(
  "a project can be created with an explicit owner",
  r.status === 201 && r.body.project?.ownerProfileId === bob.id,
  r.body,
);
const bobProject = r.body.project;
createdProjectIds.push(bobProject.id);

const founderOwnerNotices = await db("notifications").where({
  recipient_profile_id: bob.id,
  type: "project.owner_changed",
});
check("the new owner is notified", founderOwnerNotices.length >= 1, founderOwnerNotices.length);

/* ======================================================== PROJECT ACCESS */

r = await call(`/api/projects/${orgA}/${websiteProject.id}`, json("GET", bob.token));
check("any active org member can view a project (no membership row required)", r.status === 200, r.body);

r = await call(`/api/projects/${orgA}/${websiteProject.id}`, json("GET", outsider.token));
check("a non-member cannot view a project", r.status === 404, r.status);

if (crossOrgProbe) {
  r = await call(`/api/projects/${orgA}/${crossOrgProbe}`, json("GET", founder.token));
  check("a project id from another organisation is not found here", r.status === 404, r.status);
}

/* ======================================================= PROJECT MEMBERS */

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/members`,
  json("POST", bob.token, { profileId: carol.id }),
);
check("a non-owner, non-admin member cannot add a contributor", r.status === 403, r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/members`,
  json("POST", alice.token, { profileId: carol.id }),
);
check("the project owner can add a contributor", r.status === 201 && r.body.member?.profileId === carol.id, r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/members`,
  json("POST", founder.token, { profileId: carol.id }),
);
check("adding the same contributor twice is a conflict", r.status === 409, r.body);

r = await call(`/api/projects/${orgA}/${websiteProject.id}/members`, json("GET", carol.token));
check("a contributor can list the roster", r.status === 200 && r.body.members?.length === 1, r.body);

const carolAddedNotices = await db("notifications").where({
  recipient_profile_id: carol.id,
  type: "project.member_added",
});
check("the added contributor is notified", carolAddedNotices.length >= 1, carolAddedNotices.length);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/members/${carol.id}`,
  json("DELETE", bob.token),
);
check("a non-manager cannot remove a contributor", r.status === 403, r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/members/${carol.id}`,
  json("DELETE", alice.token),
);
check("the owner can remove a contributor", r.status === 200, r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/members`,
  json("POST", outsider.token, { profileId: carol.id }),
);
check("a non-member cannot add a contributor to another org's project", r.status === 404, r.status);

// Re-add Carol for the outcomes/work sections below.
await call(
  `/api/projects/${orgA}/${websiteProject.id}/members`,
  json("POST", alice.token, { profileId: carol.id }),
);

/* ====================================================== PROJECT OUTCOMES */

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/outcomes`,
  json("POST", bob.token, { title: "Should fail" }),
);
check("a non-manager cannot create an outcome", r.status === 403, r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/outcomes`,
  json("POST", alice.token, { title: "Launch new homepage", targetDate: "not-a-date" }),
);
check("an invalid target date is rejected", r.status === 422 && r.body.errors?.[0]?.field === "targetDate", r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/outcomes`,
  json("POST", alice.token, {
    title: "Launch new homepage",
    targetDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  }),
);
check(
  "the owner can create an outcome, defaulting to not_started",
  r.status === 201 && r.body.outcome?.status === "not_started",
  r.body,
);
const homepageOutcome = r.body.outcome;

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/outcomes/${homepageOutcome.id}`,
  json("PATCH", alice.token, { status: "in_progress" }),
);
check("the outcome status can move to in_progress", r.status === 200 && r.body.outcome?.status === "in_progress", r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/outcomes/${homepageOutcome.id}`,
  json("PATCH", alice.token, { status: "done" }),
);
check("the outcome status can move to done", r.status === 200 && r.body.outcome?.status === "done", r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/outcomes`,
  json("GET", outsider.token),
);
check("a non-member cannot list outcomes", r.status === 404, r.status);

/* =================================================== WORK INTEGRATION */

r = await call(
  "/api/work",
  json("POST", alice.token, {
    organisationId: orgA,
    title: `Design new homepage ${stamp}`,
    assigneeProfileId: bob.id,
    projectId: websiteProject.id,
  }),
);
check("Work can be created directly under a project", r.status === 201 && r.body.workItem?.projectId === websiteProject.id, r.body);
const designWork = r.body.workItem.id as number;
createdWorkIds.push(designWork);

r = await call(
  "/api/work",
  json("POST", alice.token, { organisationId: orgA, title: `Standalone work ${stamp}`, assigneeProfileId: alice.id }),
);
const standaloneWork = r.body.workItem.id as number;
createdWorkIds.push(standaloneWork);
check("standalone Work has no project by default", r.body.workItem?.projectId === null, r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/work/${standaloneWork}/link`,
  json("POST", bob.token),
);
check("a non-manager cannot link existing work to a project", r.status === 403, r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/work/${standaloneWork}/link`,
  json("POST", alice.token),
);
check("the owner can link existing work to the project", r.status === 200 && r.body.workItem?.projectId === websiteProject.id, r.body);

r = await call(`/api/projects/${orgA}/${websiteProject.id}/work`, json("GET", carol.token));
check("the project's work list reflects both items", r.status === 200 && r.body.workItems?.length === 2, r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/work/${standaloneWork}/unlink`,
  json("POST", alice.token),
);
check("the owner can unlink work from the project", r.status === 200 && r.body.workItem?.projectId === null, r.body);

r = await call(`/api/projects/${orgA}/${websiteProject.id}/work`, json("GET", carol.token));
check("the project's work list drops the unlinked item", r.body.workItems?.length === 1, r.body);

// Cross-org: a work item from orgB cannot be linked into an orgA project.
r = await call(
  "/api/work",
  json("POST", outsider.token, { organisationId: orgB, title: `Other org work ${stamp}`, assigneeProfileId: outsider.id }),
);
const otherOrgWork = r.body.workItem.id as number;

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/work/${otherOrgWork}/link`,
  json("POST", alice.token),
);
check("work from another organisation cannot be linked", r.status === 422, r.body);

await call(`/api/work/${otherOrgWork}`, json("PATCH", outsider.token, { status: "cancelled" }));
createdWorkIds.push(otherOrgWork);

/* =============================================================== HEALTH */

r = await call(
  "/api/work",
  json("POST", alice.token, {
    organisationId: orgA,
    title: `Overdue homepage copy ${stamp}`,
    assigneeProfileId: bob.id,
    projectId: websiteProject.id,
    dueAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  }),
);
const overdueWork = r.body.workItem.id as number;
createdWorkIds.push(overdueWork);

r = await call(
  "/api/work",
  json("POST", alice.token, {
    organisationId: orgA,
    title: `Blocked deploy pipeline ${stamp}`,
    assigneeProfileId: carol.id,
    projectId: websiteProject.id,
  }),
);
const blockedWork = r.body.workItem.id as number;
createdWorkIds.push(blockedWork);
await call(`/api/work/${blockedWork}`, json("PATCH", alice.token, { status: "blocked", blockedReason: "waiting_approval" }));

r = await call(
  "/api/work",
  json("POST", alice.token, {
    organisationId: orgA,
    title: `Stalled QA pass ${stamp}`,
    assigneeProfileId: bob.id,
    projectId: websiteProject.id,
  }),
);
const stalledWork = r.body.workItem.id as number;
createdWorkIds.push(stalledWork);
await db("work_items").where({ id: stalledWork }).update({ last_activity_at: db.raw("now() - interval '20 days'") });

r = await call(
  "/api/work",
  json("POST", alice.token, {
    organisationId: orgA,
    title: `Finished favicon ${stamp}`,
    assigneeProfileId: alice.id,
    projectId: websiteProject.id,
  }),
);
const doneWork = r.body.workItem.id as number;
createdWorkIds.push(doneWork);
await call(`/api/work/${doneWork}`, json("PATCH", alice.token, { status: "done", progress: 100 }));

r = await call(`/api/projects/${orgA}/${websiteProject.id}/health`, json("GET", alice.token));
const health = r.body.health;
check("health reports the overdue item", health?.overdueWork >= 1, health);
check("health reports the blocked item", health?.blockedWork >= 1, health);
check("health reports the stalled item", health?.stalledWork >= 1, health);
check("health reports the completed item", health?.completedWork >= 1, health);
check(
  "health surfaces factual signal sentences, not a score",
  Array.isArray(health?.signals) && health.signals.length > 0 && health.signals.every((s: unknown) => typeof s === "string"),
  health?.signals,
);
check(
  "no employee performance score is generated",
  !("score" in health) && !("rating" in health) && !("performance" in health) && !("ranking" in health),
  health,
);

r = await call(`/api/projects/${orgA}/${websiteProject.id}`, json("GET", alice.token));
check(
  "the project overview bundles work, members, outcomes and health in one call",
  r.status === 200 &&
    Array.isArray(r.body.work) &&
    Array.isArray(r.body.members) &&
    Array.isArray(r.body.outcomes) &&
    typeof r.body.health === "object" &&
    Array.isArray(r.body.events),
  r.body,
);

const openWorkBefore = health.openWork;
await call(`/api/work/${overdueWork}`, json("PATCH", alice.token, { status: "done", progress: 100 }));
r = await call(`/api/projects/${orgA}/${websiteProject.id}/health`, json("GET", alice.token));
check(
  "completing a work item removes it from open/overdue counts",
  r.body.health?.openWork === openWorkBefore - 1,
  { before: openWorkBefore, after: r.body.health?.openWork },
);

/* ========================================================== LIFECYCLE */

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/status`,
  json("POST", bob.token, { status: "active" }),
);
check("a non-manager cannot change project status", r.status === 403, r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/status`,
  json("POST", alice.token, { status: "completed" }),
);
check("planned cannot jump straight to completed", r.status === 422, r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/status`,
  json("POST", alice.token, { status: "active" }),
);
check("planned -> active is allowed", r.status === 200 && r.body.project?.status === "active", r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/status`,
  json("POST", alice.token, { status: "paused" }),
);
check("active -> paused is allowed", r.status === 200 && r.body.project?.status === "paused", r.body);

const pauseStatusNotices = await db("notifications").where({
  recipient_profile_id: carol.id,
  type: "project.status_changed",
});
check("contributors are notified of a status change", pauseStatusNotices.length >= 1, pauseStatusNotices.length);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/status`,
  json("POST", alice.token, { status: "active" }),
);
check("paused -> active is allowed", r.status === 200 && r.body.project?.status === "active", r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/status`,
  json("POST", alice.token, { status: "completed" }),
);
check("active -> completed is allowed", r.status === 200 && r.body.project?.status === "completed", r.body);

r = await call(
  `/api/projects/${orgA}/${websiteProject.id}/status`,
  json("POST", alice.token, { status: "active" }),
);
check("completed is terminal — it cannot reopen", r.status === 422, r.body);

r = await call(`/api/projects/${orgA}/${websiteProject.id}/archive`, json("POST", bob.token));
check("a non-manager cannot archive a project", r.status === 403, r.body);

r = await call(`/api/projects/${orgA}/${websiteProject.id}/archive`, json("POST", alice.token));
check("the owner can archive a completed project", r.status === 200 && r.body.project?.archivedAt !== null, r.body);

r = await call(`/api/projects/${orgA}/${websiteProject.id}/unarchive`, json("POST", alice.token));
check("the owner can restore it from the archive", r.status === 200 && r.body.project?.archivedAt === null, r.body);

r = await call(
  `/api/projects/${orgA}/${bobProject.id}/status`,
  json("POST", founder.token, { status: "cancelled" }),
);
check("planned -> cancelled is allowed (cancellation)", r.status === 200 && r.body.project?.status === "cancelled", r.body);

r = await call(
  `/api/projects/${orgA}/${bobProject.id}/status`,
  json("POST", founder.token, { status: "active" }),
);
check("cancelled is terminal", r.status === 422, r.body);

/* ============================================================= HISTORY */

r = await call(`/api/projects/${orgA}/${websiteProject.id}/events`, json("GET", alice.token));
const eventTypes = (r.body.events ?? []).map((e: { type: string }) => e.type);
check(
  "the project's timeline records creation, membership, outcomes, work links and every status change",
  r.status === 200 &&
    eventTypes.includes("created") &&
    eventTypes.includes("member_added") &&
    eventTypes.includes("outcome_added") &&
    eventTypes.includes("work_linked") &&
    eventTypes.filter((t: string) => t === "status_changed").length >= 4,
  eventTypes,
);

r = await call(`/api/projects/${orgA}/${websiteProject.id}/events`, json("GET", outsider.token));
check("a non-member cannot read a project's history", r.status === 404, r.status);

/* ============================================== REAL END-TO-END SCENARIO */

r = await call(
  `/api/projects/${orgA}`,
  json("POST", founder.token, {
    name: "Launch Yahzel V1",
    description: "Ship the first usable release.",
    startDate: new Date().toISOString(),
    targetEndDate: new Date(Date.now() + 45 * 86_400_000).toISOString(),
  }),
);
check("Launch Yahzel V1 is created", r.status === 201, r.body);
const launchProject = r.body.project;
createdProjectIds.push(launchProject.id);

await call(`/api/projects/${orgA}/${launchProject.id}/members`, json("POST", founder.token, { profileId: alice.id }));
await call(`/api/projects/${orgA}/${launchProject.id}/members`, json("POST", founder.token, { profileId: bob.id }));

async function addOutcome(title: string) {
  const res = await call(
    `/api/projects/${orgA}/${launchProject.id}/outcomes`,
    json("POST", founder.token, { title }),
  );
  return res.body.outcome;
}

const outcomeEngine = await addOutcome("Production-ready Work engine");
const outcomeStructure = await addOutcome("Organisation structure");
const outcomeLaunchReady = await addOutcome("User-facing launch readiness");

async function addLaunchWork(title: string, assigneeProfileId: number, extra: Record<string, unknown> = {}) {
  const res = await call(
    "/api/work",
    json("POST", founder.token, {
      organisationId: orgA,
      title,
      assigneeProfileId,
      projectId: launchProject.id,
      ...extra,
    }),
  );
  createdWorkIds.push(res.body.workItem.id);
  return res.body.workItem.id as number;
}

const engineWork = await addLaunchWork("Finish Work report review flow", alice.id);
const structureWork = await addLaunchWork("Model departments in the org chart", bob.id);
const launchOverdueWork = await addLaunchWork("Write onboarding docs", alice.id, {
  dueAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
});
const launchBlockedWork = await addLaunchWork("Provision production database", bob.id);
const launchStalledWork = await addLaunchWork("Audit notification copy", alice.id);

await call(`/api/work/${engineWork}`, json("PATCH", founder.token, { status: "done", progress: 100 }));
await call(`/api/work/${launchBlockedWork}`, json("PATCH", founder.token, { status: "blocked", blockedReason: "waiting_approval" }));
await db("work_items").where({ id: launchStalledWork }).update({ last_activity_at: db.raw("now() - interval '20 days'") });

r = await call(`/api/projects/${orgA}/${launchProject.id}`, json("GET", founder.token));
let overview = r.body;
check(
  "the Project accurately derives completion, open, overdue, blocked and stalled Work",
  overview.health.completedWork === 1 &&
    overview.health.overdueWork === 1 &&
    overview.health.blockedWork === 1 &&
    overview.health.stalledWork === 1 &&
    overview.health.totalWork === 5,
  overview.health,
);
check("outcome state is tracked (none done yet)", overview.health.outcomesDone === 0 && overview.health.outcomesTotal === 3, overview.health);

await call(`/api/projects/${orgA}/${launchProject.id}/outcomes/${outcomeEngine.id}`, json("PATCH", founder.token, { status: "done" }));

// Resolve the remaining open Work.
await call(`/api/work/${structureWork}`, json("PATCH", founder.token, { status: "done", progress: 100 }));
await call(`/api/work/${launchOverdueWork}`, json("PATCH", founder.token, { status: "done", progress: 100 }));
await call(`/api/work/${launchBlockedWork}`, json("PATCH", founder.token, { status: "in_progress" }));
await call(`/api/work/${launchBlockedWork}`, json("PATCH", founder.token, { status: "done", progress: 100 }));
await call(`/api/work/${launchStalledWork}`, json("PATCH", founder.token, { status: "done", progress: 100 }));

await call(`/api/projects/${orgA}/${launchProject.id}/outcomes/${outcomeStructure.id}`, json("PATCH", founder.token, { status: "done" }));
await call(`/api/projects/${orgA}/${launchProject.id}/outcomes/${outcomeLaunchReady.id}`, json("PATCH", founder.token, { status: "done" }));

r = await call(`/api/projects/${orgA}/${launchProject.id}/health`, json("GET", founder.token));
check(
  "Project health changes once all Work and outcomes are resolved",
  r.body.health?.completedWork === 5 &&
    r.body.health?.overdueWork === 0 &&
    r.body.health?.blockedWork === 0 &&
    r.body.health?.stalledWork === 0 &&
    r.body.health?.outcomesDone === 3,
  r.body.health,
);

await call(`/api/projects/${orgA}/${launchProject.id}/status`, json("POST", founder.token, { status: "active" }));
r = await call(`/api/projects/${orgA}/${launchProject.id}/status`, json("POST", founder.token, { status: "completed" }));
check(
  "the Project itself is completed only by an explicit organisational decision — Work completion never does it automatically",
  r.status === 200 && r.body.project?.status === "completed",
  r.body,
);

r = await call(`/api/projects/${orgA}/${launchProject.id}/events`, json("GET", founder.token));
const launchEventTypes = (r.body.events ?? []).map((e: { type: string }) => e.type);
check(
  "history remains intact after completion — nothing is rewritten or dropped",
  launchEventTypes.includes("created") &&
    launchEventTypes.filter((t: string) => t === "member_added").length === 2 &&
    launchEventTypes.filter((t: string) => t === "outcome_added").length === 3 &&
    launchEventTypes.filter((t: string) => t === "outcome_updated").length === 3 &&
    launchEventTypes.filter((t: string) => t === "work_linked").length === 0 &&
    launchEventTypes.filter((t: string) => t === "status_changed").length === 2,
  launchEventTypes,
);

/* --------------------------------------------------------------- teardown */

await db("notifications")
  .where((qb) =>
    qb
      .whereIn("organisation_id", [orgA, orgB])
      .orWhereIn("recipient_profile_id", [founder.id, alice.id, bob.id, carol.id, outsider.id]),
  )
  .delete();
await db("work_items").whereIn("id", createdWorkIds).delete();
await db("organisations").whereIn("id", [orgA, orgB]).delete();
await db("profiles")
  .whereIn("id", [founder.id, alice.id, bob.id, carol.id, outsider.id])
  .delete();

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
