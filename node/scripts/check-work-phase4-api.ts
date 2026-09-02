import { db } from "../src/db/knex.js";

/**
 * End-to-end check of Phase 4 (built-in capabilities, recurring work,
 * stalled-work diagnostics, blocked reasons, contract expiry), in the style
 * of check-work-phase2-api.ts: it drives the running API over HTTP with
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

/** The caller's own organisation_members.id in one organisation. */
async function myMembershipId(orgId: number, token: string): Promise<number> {
  const res = await call(`/api/organisations/${orgId}`, json("GET", token));
  return res.body.membership?.id as number;
}

async function notificationCount(type: string, recipientProfileId: number) {
  const rows = await db("notifications").where({
    type,
    recipient_profile_id: recipientProfileId,
  });
  return rows.length;
}

const stamp = Date.now();

const founder = await makeUser("P4 Founder", `p4-founder${stamp}@example.com`);
const member = await makeUser("P4 Member", `p4-member${stamp}@example.com`);
const outsider = await makeUser("P4 Outsider", `p4-outsider${stamp}@example.com`);

let r = await call(
  "/api/organisations",
  json("POST", founder.token, { name: `P4 Org A ${stamp}`, type: "company" }),
);
const orgA = r.body.organisation?.id as number;

r = await call(
  "/api/organisations",
  json("POST", outsider.token, { name: `P4 Org B ${stamp}`, type: "company" }),
);
const orgB = r.body.organisation?.id as number;

await addActiveMember(orgA, founder.token, member);

/* ============================================================ Capabilities */

r = await call(
  `/api/work/capabilities?organisationId=${orgA}`,
  json("GET", founder.token),
);
check(
  "listing capabilities seeds the built-in catalogue",
  r.status === 200 &&
    r.body.capabilities?.some((c: { key: string }) => c.key === "onboarding"),
  r.body,
);
const onboarding = r.body.capabilities.find(
  (c: { key: string }) => c.key === "onboarding",
);

r = await call(
  `/api/work/capabilities?organisationId=${orgA}`,
  json("GET", member.token),
);
check("a non-admin member can list capabilities (to use them)", r.status === 200, r.body);

r = await call(
  `/api/work/capabilities?organisationId=${orgA}`,
  json("GET", outsider.token),
);
check("a non-member cannot list another org's capabilities", r.status === 404, r.status);

r = await call(
  "/api/work/capabilities",
  json("POST", member.token, {
    organisationId: orgA,
    name: "Should fail",
    suggestedTitle: "x",
  }),
);
check("a non-admin cannot create a custom capability", r.status === 403, r.body);

r = await call(
  "/api/work/capabilities",
  json("POST", founder.token, {
    organisationId: orgA,
    name: `Custom check-in ${stamp}`,
    suggestedTitle: "Custom check-in",
    defaultAssigneeRule: "caller",
    cadence: "weekly",
  }),
);
check(
  "an admin can create a custom capability",
  r.status === 201 && r.body.capability?.builtIn === false && r.body.capability?.cadence === "weekly",
  r.body,
);
const customCapability = r.body.capability;

r = await call(`/api/work/capabilities/${onboarding.id}`, json("PATCH", founder.token, {
  suggestedTitle: "Onboard the new member (customised)",
}));
check(
  "an admin can customise a built-in capability without an immutable workflow",
  r.status === 200 &&
    r.body.capability?.suggestedTitle === "Onboard the new member (customised)" &&
    r.body.capability?.key === "onboarding" &&
    r.body.capability?.builtIn === true,
  r.body,
);

/* -------------------------------------------------- Instantiate → full flow */

r = await call(`/api/work/capabilities/${onboarding.id}/instantiate`, json("POST", founder.token, {
  assigneeProfileId: member.id,
}));
check(
  "a built-in capability creates a NORMAL Work item",
  r.status === 201 && r.body.workItem?.sourceCapabilityId === onboarding.id,
  r.body,
);
const onboardingWork = r.body.workItem.id as number;

r = await call(`/api/work/${onboardingWork}`, json("GET", founder.token));
check(
  "the generated Work item behaves exactly like ordinary Work (visible via GET /api/work/:id)",
  r.status === 200 && r.body.workItem?.id === onboardingWork,
  r.body,
);

r = await call(`/api/work/${onboardingWork}/reports`, json("POST", member.token, {
  body: "Completed onboarding checklist.",
  submit: true,
}));
check("the assignee can report on generated Work", r.status === 201 && r.body.report?.state === "submitted", r.body);
const onboardingReportId = r.body.report.id as number;

r = await call(`/api/work/${onboardingWork}/reports/${onboardingReportId}/accept`, json("POST", founder.token));
check("the creator can accept the report on generated Work", r.status === 200 && r.body.report?.state === "accepted", r.body);

r = await call(`/api/work/${onboardingWork}`, json("GET", founder.token));
check(
  "accepted generated Work reaches done/100 and keeps its assignment history",
  r.body.workItem?.status === "done" &&
    r.body.workItem?.progress === 100 &&
    r.body.assignmentHistory?.length === 1,
  r.body,
);

/* ================================================================ Recurring */

r = await call("/api/work/schedules", json("POST", founder.token, {
  organisationId: orgA,
  capabilityId: onboarding.id === customCapability.id ? onboarding.id : customCapability.id,
  cadence: "weekly",
  nextRunOn: new Date().toISOString().slice(0, 10),
  assigneeProfileId: member.id,
}));
check("an admin can create a weekly recurring schedule", r.status === 201 && r.body.schedule?.cadence === "weekly", r.body);
const weeklySchedule = r.body.schedule;

r = await call("/api/work/schedules", json("POST", founder.token, {
  organisationId: orgA,
  capabilityId: onboarding.id, // onboarding has no cadence — cadence must be supplied
  cadence: "monthly",
  nextRunOn: new Date().toISOString().slice(0, 10),
  assigneeProfileId: member.id,
}));
check("an admin can create a monthly recurring schedule", r.status === 201 && r.body.schedule?.cadence === "monthly", r.body);
const monthlySchedule = r.body.schedule;

// An inactive schedule — flipped directly, there is no toggle endpoint —
// must never generate, regardless of how due it is.
r = await call("/api/work/schedules", json("POST", founder.token, {
  organisationId: orgA,
  capabilityId: onboarding.id,
  cadence: "monthly",
  nextRunOn: "2000-01-01",
  assigneeProfileId: member.id,
}));
const inactiveSchedule = r.body.schedule;
await db("work_schedules").where({ id: inactiveSchedule.id }).update({ active: false });

r = await call("/api/work/schedules/generate", json("POST", founder.token, { organisationId: orgA }));
check(
  "generation produces exactly the two due, active schedules' Work",
  r.status === 200 && r.body.workItems?.length === 2,
  r.body,
);

const occurrencesAfterFirstRun = await db("work_schedule_occurrences").where({
  organisation_id: orgA,
});
check(
  "each generated Work item carries its source schedule/capability/occurrence",
  r.body.workItems.every(
    (w: { sourceScheduleId: number | null; occurrenceKey: string | null }) =>
      w.sourceScheduleId !== null && w.occurrenceKey !== null,
  ),
  r.body.workItems,
);
check(
  "an inactive schedule did not generate",
  !occurrencesAfterFirstRun.some((o) => o.schedule_id === inactiveSchedule.id),
  occurrencesAfterFirstRun,
);

r = await call("/api/work/schedules/generate", json("POST", founder.token, { organisationId: orgA }));
check("running generation again produces nothing new (already generated this period)", r.status === 200 && r.body.workItems?.length === 0, r.body);

const occurrencesAfterSecondRun = await db("work_schedule_occurrences").where({
  organisation_id: orgA,
});
check(
  "duplicate generation is prevented — occurrence rows did not grow",
  occurrencesAfterSecondRun.length === occurrencesAfterFirstRun.length,
  { first: occurrencesAfterFirstRun.length, second: occurrencesAfterSecondRun.length },
);

r = await call(`/api/work/schedules?organisationId=${orgA}`, json("GET", founder.token));
check("schedules can be listed", r.status === 200 && r.body.schedules?.length === 3, r.body);

/* ============================================================= Stalled work */

// A plain Work item, backdated past the default 14-day inactive threshold.
r = await call("/api/work", json("POST", founder.token, {
  organisationId: orgA,
  title: `Stalled inactive ${stamp}`,
  assigneeProfileId: member.id,
}));
const staleWork = r.body.workItem.id as number;
await db("work_items")
  .where({ id: staleWork })
  .update({ last_activity_at: db.raw("now() - interval '20 days'") });

// A blocked Work item, backdated past the default 7-day blocked threshold.
r = await call("/api/work", json("POST", founder.token, {
  organisationId: orgA,
  title: `Stalled blocked ${stamp}`,
  assigneeProfileId: member.id,
}));
const blockedWork = r.body.workItem.id as number;

r = await call(`/api/work/${blockedWork}`, json("PATCH", founder.token, {
  status: "blocked",
}));
check("blocking without a reason is rejected", r.status === 422 && r.body.errors?.[0]?.field === "blockedReason", r.body);

r = await call(`/api/work/${blockedWork}`, json("PATCH", founder.token, {
  status: "blocked",
  blockedReason: "not_a_real_reason",
}));
check("an invalid blocked reason is rejected", r.status === 422 && r.body.errors?.[0]?.field === "blockedReason", r.body);

r = await call(`/api/work/${blockedWork}`, json("PATCH", founder.token, {
  status: "blocked",
  blockedReason: "waiting_approval",
}));
check(
  "a valid blocked reason is accepted",
  r.status === 200 && r.body.workItem?.status === "blocked" && r.body.workItem?.blockedReason === "waiting_approval",
  r.body,
);
await db("work_items")
  .where({ id: blockedWork })
  .update({ last_activity_at: db.raw("now() - interval '10 days'") });

r = await call(`/api/work/${blockedWork}`, json("PATCH", founder.token, { status: "in_progress" }));
check(
  "leaving blocked clears the blocked reason",
  r.status === 200 && r.body.workItem?.status === "in_progress" && r.body.workItem?.blockedReason === null,
  r.body,
);
// Put it back to blocked (and re-backdate) for the stall scan below.
await call(`/api/work/${blockedWork}`, json("PATCH", founder.token, {
  status: "blocked",
  blockedReason: "waiting_approval",
}));
await db("work_items")
  .where({ id: blockedWork })
  .update({ last_activity_at: db.raw("now() - interval '10 days'") });

// An overdue Work item.
r = await call("/api/work", json("POST", founder.token, {
  organisationId: orgA,
  title: `Overdue work ${stamp}`,
  assigneeProfileId: member.id,
  dueAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
}));
const overdueWork = r.body.workItem.id as number;

r = await call("/api/work/stalled/scan", json("POST", founder.token, { organisationId: orgA }));
check("stalled scan succeeds", r.status === 200, r.body);

const stalledIds = new Set(r.body.stalled.map((s: { workItem: { id: number } }) => s.workItem.id));
check("stalled scan flags the inactive item", stalledIds.has(staleWork), r.body.stalled);
check("stalled scan flags the blocked item", stalledIds.has(blockedWork), r.body.stalled);
check("stalled scan flags the overdue item", stalledIds.has(overdueWork), r.body.stalled);

const staleEntry = r.body.stalled.find((s: { workItem: { id: number } }) => s.workItem.id === staleWork);
const blockedEntry = r.body.stalled.find((s: { workItem: { id: number } }) => s.workItem.id === blockedWork);
const overdueEntry = r.body.stalled.find((s: { workItem: { id: number } }) => s.workItem.id === overdueWork);

check(
  "diagnostics carry accountable person, status, activity, due date, age and a suggested action — no rating fields",
  staleEntry?.kind === "stalled_inactive" &&
    typeof staleEntry?.accountableProfileId === "number" &&
    typeof staleEntry?.ageDays === "number" &&
    typeof staleEntry?.suggestedNextAction === "string" &&
    !("rating" in staleEntry) &&
    !("score" in staleEntry) &&
    !("performance" in staleEntry),
  staleEntry,
);
check(
  "the diagnostic message is factual, not a judgement of the person",
  typeof staleEntry?.message === "string" &&
    /no recorded activity/i.test(staleEntry.message) &&
    !/underperform/i.test(staleEntry.message),
  staleEntry?.message,
);
check("blocked diagnostic carries its blocked reason", blockedEntry?.blockedReason === "waiting_approval", blockedEntry);
check("overdue diagnostic is kind=overdue", overdueEntry?.kind === "overdue", overdueEntry);

const memberStallNotices = await notificationCount("work.stalled", member.id);
check("stalled work generated notifications for the accountable person", memberStallNotices >= 3, memberStallNotices);

r = await call("/api/work/stalled/scan", json("POST", founder.token, { organisationId: orgA }));
const memberStallNoticesAfterRescan = await notificationCount("work.stalled", member.id);
check(
  "re-running the scan does not re-notify for an unchanged stall",
  memberStallNoticesAfterRescan === memberStallNotices,
  { before: memberStallNotices, after: memberStallNoticesAfterRescan },
);

// Resolve the stale item and confirm it drops off the list.
await call(`/api/work/${staleWork}`, json("PATCH", founder.token, { status: "done", progress: 100 }));
r = await call("/api/work/stalled/scan", json("POST", founder.token, { organisationId: orgA }));
const stalledIdsAfterResolve = new Set(
  r.body.stalled.map((s: { workItem: { id: number } }) => s.workItem.id),
);
check("a resolved item no longer appears as stalled", !stalledIdsAfterResolve.has(staleWork), r.body.stalled);

const staleNoticeAfterResolve = await db("work_stall_notices").where({ work_item_id: staleWork }).first();
check("its stall notice is cleared once resolved", staleNoticeAfterResolve === undefined, staleNoticeAfterResolve);

/* =========================================================== Work settings */

r = await call(`/api/work/settings?organisationId=${orgA}`, json("GET", founder.token));
check(
  "work settings default to 30/14/7",
  r.status === 200 &&
    r.body.settings?.contractNoticeDays === 30 &&
    r.body.settings?.stalledInactiveDays === 14 &&
    r.body.settings?.stalledBlockedDays === 7,
  r.body,
);

r = await call("/api/work/settings", json("PATCH", member.token, { organisationId: orgA, stalledInactiveDays: 5 }));
check("a non-admin cannot change work settings", r.status === 403, r.body);

r = await call("/api/work/settings", json("PATCH", founder.token, { organisationId: orgA, stalledInactiveDays: 21 }));
check("an admin can change a threshold", r.status === 200 && r.body.settings?.stalledInactiveDays === 21, r.body);

r = await call(`/api/work/settings?organisationId=${orgA}`, json("GET", outsider.token));
check("a non-member cannot read another org's settings", r.status === 404, r.status);

// Restore the default so the earlier stalled-work assertions above are not
// retroactively invalidated by a later re-run against the same server.
await call("/api/work/settings", json("PATCH", founder.token, { organisationId: orgA, stalledInactiveDays: 14 }));

/* ============================================================ Contract expiry */

const memberMembershipId = await myMembershipId(orgA, member.token);

r = await call(`/api/employment/${orgA}/members/${memberMembershipId}`, json("POST", founder.token, {
  startDate: new Date(Date.now() - 400 * 86_400_000).toISOString(),
}));
const employmentRecordId = r.body.employmentRecord?.id as number;
check("an employment record can be created for the member", r.status === 201 && !!employmentRecordId, r.body);

const contractEnd = new Date(Date.now() + 10 * 86_400_000).toISOString();
r = await call(`/api/employment/${orgA}/${employmentRecordId}/contracts`, json("POST", founder.token, {
  contractType: "fixed_term",
  startDate: new Date(Date.now() - 300 * 86_400_000).toISOString(),
  endDate: contractEnd,
  status: "active",
}));
const contractId = r.body.contract?.id as number;
check("a fixed-term contract can be created", r.status === 201 && !!contractId, r.body);

r = await call(`/api/employment/${orgA}/expiring-contracts`, json("GET", founder.token));
const expiringEntry = r.body.expiring?.find((e: { contract: { id: number } }) => e.contract.id === contractId);
check(
  "the expiring contract is identified within the notice window",
  r.status === 200 && !!expiringEntry && expiringEntry.daysUntilExpiry <= 10,
  r.body,
);
check("the expiring contract's obligation carries no linked Work yet", expiringEntry?.linkedWorkItemId === null, expiringEntry);

const founderExpiryNotices = await notificationCount("employment.contract.expiring", founder.id);
check("the admin was notified of the approaching expiry", founderExpiryNotices >= 1, founderExpiryNotices);

r = await call(`/api/employment/${orgA}/contracts/${contractId}/review-work`, json("POST", founder.token, {
  action: "review",
}));
check(
  "a normal Work item can be created and linked to the contract/employment record",
  r.status === 201 && r.body.workItem?.contractId === contractId && r.body.workItem?.employmentRecordId === employmentRecordId,
  r.body,
);
const reviewWorkId = r.body.workItem.id as number;

r = await call(`/api/employment/${orgA}/expiring-contracts`, json("GET", founder.token));
const expiringAfterReview = r.body.expiring?.find(
  (e: { contract: { id: number } }) => e.contract.id === contractId,
);
check("the obligation now links to the created Work item", expiringAfterReview?.linkedWorkItemId === reviewWorkId, expiringAfterReview);

const contractRowAfter = await db("contracts").where({ id: contractId }).first();
check(
  "the contract itself is untouched — no auto-renewal, no history rewrite",
  contractRowAfter.status === "active" &&
    new Date(contractRowAfter.end_date).toISOString() === contractEnd,
  contractRowAfter,
);

r = await call(`/api/employment/${orgA}/scan-expiry`, json("POST", founder.token));
const founderExpiryNoticesAfterRescan = await notificationCount("employment.contract.expiring", founder.id);
check(
  "duplicate expiry notices are prevented",
  founderExpiryNoticesAfterRescan === founderExpiryNotices,
  { before: founderExpiryNotices, after: founderExpiryNoticesAfterRescan },
);

r = await call(`/api/employment/${orgA}/expiring-contracts`, json("GET", outsider.token));
check("a non-member cannot see another org's expiring contracts", r.status === 404, r.status);

/* =========================================================== Org isolation */

r = await call(`/api/work/capabilities/${onboarding.id}`, json("PATCH", outsider.token, { name: "Hijacked" }));
check("a non-member cannot edit another org's capability", r.status === 404, r.status);

r = await call("/api/work/schedules/generate", json("POST", outsider.token, { organisationId: orgA }));
check("a non-member cannot trigger generation for another org", r.status === 404, r.status);

r = await call(`/api/work/stalled?organisationId=${orgA}`, json("GET", outsider.token));
check("a non-member cannot view another org's stalled work", r.status === 404, r.status);

/* --------------------------------------------------------------- teardown */

const allWorkIds = [onboardingWork, staleWork, blockedWork, overdueWork, reviewWorkId];
await db("notifications")
  .where((qb) =>
    qb
      .whereIn("organisation_id", [orgA, orgB])
      .orWhereIn("recipient_profile_id", [founder.id, member.id, outsider.id]),
  )
  .delete();
await db("work_items").whereIn("id", allWorkIds).delete();
await db("organisations").whereIn("id", [orgA, orgB]).delete();
await db("profiles").whereIn("id", [founder.id, member.id, outsider.id]).delete();

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
