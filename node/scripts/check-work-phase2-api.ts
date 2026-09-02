import { db } from "../src/db/knex.js";

/**
 * End-to-end check of the Phase 2 Work engine (projects, child work, reports,
 * report review, attachments, notifications), in the style of
 * check-work-api.ts: it drives the running API over HTTP with throwaway
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

const founder = await makeUser("P2 Founder", `p2-founder${stamp}@example.com`);
const john = await makeUser("P2 John", `p2-john${stamp}@example.com`);
const mary = await makeUser("P2 Mary", `p2-mary${stamp}@example.com`);
const outsider = await makeUser("P2 Outsider", `p2-outsider${stamp}@example.com`);

/* ------------------------------------------------------------------- setup */

let r = await call(
  "/api/organisations",
  json("POST", founder.token, { name: `P2 Org A ${stamp}`, type: "company" }),
);
const orgA = r.body.organisation?.id as number;

r = await call(
  "/api/organisations",
  json("POST", outsider.token, { name: `P2 Org B ${stamp}`, type: "company" }),
);
const orgB = r.body.organisation?.id as number;

await addActiveMember(orgA, founder.token, john);
await addActiveMember(orgA, founder.token, mary);

/* --------------------------------------------------------------- projects */

r = await call("/api/projects/" + orgA, json("GET", founder.token));
check("a member can list projects (empty)", r.status === 200 && Array.isArray(r.body.projects), r.body);

r = await call(
  `/api/projects/${orgA}`,
  json("POST", founder.token, { name: `Project Alpha ${stamp}` }),
);
check(
  // Phase 5 grows the vocabulary to planned|active|paused|completed|cancelled
  // and moves the default to "planned" — the natural starting point, the
  // same way Work's own default is "not_started" rather than "in_progress".
  "a member can create a project",
  r.status === 201 && r.body.project?.status === "planned",
  r.body,
);
const projectA = r.body.project?.id as number;

r = await call(`/api/projects/${orgA}/${projectA}`, json("GET", john.token));
check("a member can get one project", r.status === 200 && r.body.project?.id === projectA, r.body);

r = await call(`/api/projects/${orgA}`, json("GET", outsider.token));
check("a non-member cannot list another org's projects", r.status === 404, r.status);

// A project in org B, owned by the outsider — used for the cross-org checks.
r = await call(
  `/api/projects/${orgB}`,
  json("POST", outsider.token, { name: `Project Beta ${stamp}` }),
);
const projectB = r.body.project?.id as number;

r = await call(`/api/projects/${orgA}/${projectB}`, json("GET", founder.token));
check("a project from another org reads as not found", r.status === 404, r.status);

/* ----------------------------------------------- department for scoping */

r = await call(
  `/api/departments/${orgA}`,
  json("POST", founder.token, { name: `Ops ${stamp}` }),
);
const deptA = r.body.department?.id as number;

r = await call(
  `/api/departments/${orgB}`,
  json("POST", outsider.token, { name: `Ops B ${stamp}` }),
);
const deptB = r.body.department?.id as number;

/* ------------------------------------------ create work with optional links */

r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgA,
    title: `Parent task ${stamp}`,
    assigneeProfileId: john.id,
    projectId: projectA,
    departmentId: deptA,
  }),
);
check(
  "work can be created with a project and a department",
  r.status === 201 &&
    r.body.workItem?.projectId === projectA &&
    r.body.workItem?.departmentId === deptA &&
    r.body.workItem?.parentId === null,
  r.body,
);
const parentWork = r.body.workItem?.id as number;

check(
  "a new work item has a last_activity_at and no progress/report moment yet",
  typeof r.body.workItem?.lastActivityAt === "string" &&
    r.body.workItem?.lastProgressAt === null &&
    r.body.workItem?.lastReportAt === null,
  r.body.workItem,
);

// A child, one level down.
r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgA,
    title: `Child task ${stamp}`,
    assigneeProfileId: john.id,
    parentId: parentWork,
  }),
);
check("a child work item can be created", r.status === 201 && r.body.workItem?.parentId === parentWork, r.body);
const childWork = r.body.workItem?.id as number;

// A child of a child is refused (max depth 1).
r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgA,
    title: `Grandchild task ${stamp}`,
    assigneeProfileId: john.id,
    parentId: childWork,
  }),
);
check(
  "a child of a child is rejected (max depth 1)",
  r.status === 422 && r.body.errors?.[0]?.field === "parentId",
  r.body,
);

// The parent lists its child.
r = await call(`/api/work/${parentWork}/children`, json("GET", founder.token));
check(
  "the parent lists exactly its one child",
  r.status === 200 && r.body.children?.length === 1 && r.body.children[0].id === childWork,
  r.body,
);

// Detail also carries children.
r = await call(`/api/work/${parentWork}`, json("GET", founder.token));
check(
  "work detail carries children and a reports array",
  Array.isArray(r.body.children) && r.body.children.length === 1 && Array.isArray(r.body.reports),
  { children: r.body.children, reports: r.body.reports },
);

/* -------------------------------------------------- cross-org link rejection */

r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgA,
    title: `Bad project ${stamp}`,
    assigneeProfileId: john.id,
    projectId: projectB,
  }),
);
check(
  "a project from another org is rejected on create",
  r.status === 422 && r.body.errors?.[0]?.field === "projectId",
  r.body,
);

r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgA,
    title: `Bad dept ${stamp}`,
    assigneeProfileId: john.id,
    departmentId: deptB,
  }),
);
check(
  "a department from another org is rejected on create",
  r.status === 422 && r.body.errors?.[0]?.field === "departmentId",
  r.body,
);

// A work item in org B, to probe as a cross-org parent.
r = await call(
  "/api/work",
  json("POST", outsider.token, {
    organisationId: orgB,
    title: `Org B work ${stamp}`,
    assigneeProfileId: outsider.id,
  }),
);
const orgBWork = r.body.workItem?.id as number;

r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgA,
    title: `Bad parent ${stamp}`,
    assigneeProfileId: john.id,
    parentId: orgBWork,
  }),
);
check(
  "a parent from another org is rejected on create",
  r.status === 422 && r.body.errors?.[0]?.field === "parentId",
  r.body,
);

/* --------------------------------------------------------- reassignment */

r = await call(
  `/api/work/${parentWork}/assign`,
  json("POST", founder.token, { assigneeProfileId: mary.id }),
);
check("the creator can reassign", r.status === 200 && r.body.assignment?.assigneeProfileId === mary.id, r.body);

r = await call(`/api/work/${parentWork}`, json("GET", founder.token));
check(
  "reassignment preserves history (2 rows, John's is reassigned)",
  r.body.assignmentHistory?.length === 2 &&
    r.body.assignmentHistory.some(
      (a: { assigneeProfileId: number; status: string }) =>
        a.assigneeProfileId === john.id && a.status === "reassigned",
    ),
  r.body.assignmentHistory,
);

// Reassign back to John so John is the reporting assignee below.
await call(
  `/api/work/${parentWork}/assign`,
  json("POST", founder.token, { assigneeProfileId: john.id }),
);

/* ------------------------------------------------------------- reports */

// Only the current assignee may report.
r = await call(
  `/api/work/${parentWork}/reports`,
  json("POST", mary.token, { body: "Mary should not be able to report." }),
);
check("a non-assignee cannot create a report", r.status === 403, r.body);

// John (the active assignee) saves a draft.
r = await call(
  `/api/work/${parentWork}/reports`,
  json("POST", john.token, { body: "First draft of the work." }),
);
check(
  "the active assignee can save a draft report",
  r.status === 201 && r.body.report?.state === "draft" && Array.isArray(r.body.report?.attachments),
  r.body,
);
const draftReport = r.body.report?.id as number;

// A second open report is refused.
r = await call(
  `/api/work/${parentWork}/reports`,
  json("POST", john.token, { body: "Second open report." }),
);
check("a second open report is rejected", r.status === 422, r.body);

// last_report_at is now set.
r = await call(`/api/work/${parentWork}`, json("GET", john.token));
check("last_report_at is set after a report", r.body.workItem?.lastReportAt !== null, r.body.workItem);

// Attach a small file to the draft.
r = await call(`/api/work/${parentWork}/reports/${draftReport}/attachments?fileName=evidence.txt`, {
  method: "POST",
  headers: {
    "Content-Type": "text/plain",
    Authorization: `Bearer ${john.token}`,
  },
  body: "evidence bytes",
});
check(
  "the author can attach evidence to a draft report",
  r.status === 201 && r.body.attachment?.fileName === "evidence.txt" && typeof r.body.attachment?.url === "string",
  r.body,
);

// Edit the draft.
r = await call(
  `/api/work/${parentWork}/reports/${draftReport}`,
  json("PATCH", john.token, { body: "Revised draft of the work." }),
);
check("the author can edit their draft", r.status === 200 && r.body.report?.body === "Revised draft of the work.", r.body);

// The attachment survives the edit and shows in the report.
check(
  "the report carries its attachment",
  r.body.report?.attachments?.length === 1,
  r.body.report?.attachments,
);

// Submit it.
r = await call(
  `/api/work/${parentWork}/reports/${draftReport}/submit`,
  json("POST", john.token),
);
check("the author can submit the draft", r.status === 200 && r.body.report?.state === "submitted", r.body);

r = await call(`/api/work/${parentWork}`, json("GET", john.token));
check("submitting moves the item to waiting_review", r.body.workItem?.status === "waiting_review", r.body.workItem);

// The author cannot accept their own report.
r = await call(
  `/api/work/${parentWork}/reports/${draftReport}/accept`,
  json("POST", john.token),
);
check("the report author cannot accept their own report", r.status === 403, r.body);

// Org isolation: the outsider cannot see the report at all.
r = await call(`/api/work/${parentWork}/reports`, json("GET", outsider.token));
check("an outsider cannot read another org's reports", r.status === 404, r.status);

// The creator accepts → done + 100.
r = await call(
  `/api/work/${parentWork}/reports/${draftReport}/accept`,
  json("POST", founder.token),
);
check("the creator can accept a submitted report", r.status === 200 && r.body.report?.state === "accepted", r.body);

r = await call(`/api/work/${parentWork}`, json("GET", founder.token));
check(
  "accepting sets the item to done at 100% and stamps a progress moment",
  r.body.workItem?.status === "done" &&
    r.body.workItem?.progress === 100 &&
    r.body.workItem?.lastProgressAt !== null,
  r.body.workItem,
);

/* -------------------------------------- return flow, history preserved */

// A fresh item to exercise return.
r = await call(
  "/api/work",
  json("POST", founder.token, {
    organisationId: orgA,
    title: `Returnable task ${stamp}`,
    assigneeProfileId: john.id,
  }),
);
const returnWork = r.body.workItem?.id as number;

r = await call(
  `/api/work/${returnWork}/reports`,
  json("POST", john.token, { body: "Attempt one.", submit: true }),
);
check("a report can be created already submitted", r.status === 201 && r.body.report?.state === "submitted", r.body);
const firstReport = r.body.report?.id as number;

// Non-reviewer who CAN see the item (John, the assignee/author) cannot
// return it — only the creator or an active admin may.
r = await call(
  `/api/work/${returnWork}/reports/${firstReport}/return`,
  json("POST", john.token, { reason: "not allowed" }),
);
check("a non-reviewer cannot return a report", r.status === 403, r.body);

// Return without a reason is refused.
r = await call(
  `/api/work/${returnWork}/reports/${firstReport}/return`,
  json("POST", founder.token, {}),
);
check("returning without a reason is rejected", r.status === 422 && r.body.errors?.[0]?.field === "reason", r.body);

// The creator returns with a reason.
r = await call(
  `/api/work/${returnWork}/reports/${firstReport}/return`,
  json("POST", founder.token, { reason: "Please add the figures for Q3." }),
);
check(
  "the creator can return a submitted report with a reason",
  r.status === 200 &&
    r.body.report?.state === "returned" &&
    r.body.report?.decisionReason === "Please add the figures for Q3.",
  r.body,
);

r = await call(`/api/work/${returnWork}`, json("GET", founder.token));
check("returning sends the item back to in_progress", r.body.workItem?.status === "in_progress", r.body.workItem);

// The returned report is preserved AND a new report may now be created.
r = await call(
  `/api/work/${returnWork}/reports`,
  json("POST", john.token, { body: "Attempt two, with figures." }),
);
check("the assignee may start a new report after a return", r.status === 201 && r.body.report?.state === "draft", r.body);

r = await call(`/api/work/${returnWork}/reports`, json("GET", john.token));
check(
  "report history is preserved (returned row kept, new draft added)",
  r.body.reports?.length === 2 &&
    r.body.reports.some((rep: { state: string }) => rep.state === "returned") &&
    r.body.reports.some((rep: { state: string }) => rep.state === "draft"),
  r.body.reports,
);

/* --------------------------------------------- 'cancelled' work status */

r = await call(
  `/api/work/${returnWork}`,
  json("PATCH", founder.token, { status: "cancelled" }),
);
check("a work item can be cancelled", r.status === 200 && r.body.workItem?.status === "cancelled", r.body);

/* ------------------------------------------------------- notifications */

const johnNotifs = await db("notifications")
  .where({ recipient_profile_id: john.id })
  .whereIn("type", ["work.assigned", "work.report.accepted", "work.report.returned"]);
check(
  "John received work.* notifications (assigned/accepted/returned) with work_item_id",
  johnNotifs.length >= 2 && johnNotifs.every((n: { work_item_id: number | null }) => n.work_item_id !== null),
  johnNotifs.map((n: { type: string; work_item_id: number | null }) => ({ type: n.type, work: n.work_item_id })),
);

const founderNotifs = await db("notifications")
  .where({ recipient_profile_id: founder.id, type: "work.report.submitted" });
check("the creator received a work.report.submitted notification", founderNotifs.length >= 1, founderNotifs.length);

/* ------------------------------------------------------------- teardown */

const workIds = [parentWork, childWork, returnWork, orgBWork].filter(Boolean);
await db("notifications").whereIn("work_item_id", workIds).delete();
await db("work_items").whereIn("id", workIds).delete();
await db("projects").whereIn("id", [projectA, projectB]).delete();
await db("organisations").whereIn("id", [orgA, orgB]).delete();
await db("profiles")
  .whereIn("id", [founder.id, john.id, mary.id, outsider.id])
  .delete();

console.log(
  failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);

await db.destroy();
process.exit(failures === 0 ? 0 : 1);
