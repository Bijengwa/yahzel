import type { Knex } from "knex";

import { db } from "../db/knex.js";
import {
  PROJECTS_TABLE,
  PROJECT_EVENTS_TABLE,
  PROJECT_MEMBERS_TABLE,
  PROJECT_OUTCOMES_TABLE,
  type ProjectEventRecord,
  type ProjectMemberRecord,
  type ProjectMemberWithProfile,
  type ProjectOutcomeRecord,
  type ProjectRecord,
} from "./project.record.js";

const PROJECTS = PROJECTS_TABLE;
const MEMBERS = PROJECT_MEMBERS_TABLE;
const OUTCOMES = PROJECT_OUTCOMES_TABLE;
const EVENTS = PROJECT_EVENTS_TABLE;

type Queryable = Knex | Knex.Transaction;

/* ------------------------------------------------------------------------
   Projects
   --------------------------------------------------------------------- */

export function listProjects(
  organisationId: number,
): Promise<ProjectRecord[]> {
  return db<ProjectRecord>(PROJECTS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");
}

/**
 * A plain project row, used both by the read endpoints and by the org-isolation
 * check work.service runs before it lets a Work Item reference a project.
 */
export function findProjectById(
  id: number,
  queryable: Queryable = db,
): Promise<ProjectRecord | undefined> {
  return queryable<ProjectRecord>(PROJECTS).where({ id }).first();
}

export async function insertProject(input: {
  organisationId: number;
  name: string;
  description: string | null;
  status: string;
  ownerProfileId: number;
  departmentId: number | null;
  startDate: string | null;
  targetEndDate: string | null;
  createdBy: number;
}): Promise<ProjectRecord> {
  const [row] = await db<ProjectRecord>(PROJECTS)
    .insert({
      organisation_id: input.organisationId,
      name: input.name,
      description: input.description,
      status: input.status,
      owner_profile_id: input.ownerProfileId,
      department_id: input.departmentId,
      start_date: input.startDate,
      target_end_date: input.targetEndDate,
      created_by: input.createdBy,
    })
    .returning("*");

  if (!row) {
    throw new Error("The project row was not returned after insert.");
  }

  return row;
}

type ProjectPatch = Partial<
  Pick<
    ProjectRecord,
    | "name"
    | "description"
    | "status"
    | "owner_profile_id"
    | "department_id"
    | "start_date"
    | "target_end_date"
    | "archived_at"
  >
>;

export async function updateProject(
  id: number,
  patch: ProjectPatch,
): Promise<ProjectRecord> {
  const [row] = await db<ProjectRecord>(PROJECTS)
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() as unknown as string })
    .returning("*");

  if (!row) {
    throw new Error(`Project ${id} disappeared during update.`);
  }

  return row;
}

/* ------------------------------------------------------------------------
   Members — contributors only. The owner lives on projects.owner_profile_id.
   --------------------------------------------------------------------- */

function projectMemberQuery() {
  return db(MEMBERS)
    .leftJoin("profiles", "profiles.id", `${MEMBERS}.profile_id`)
    .select<ProjectMemberWithProfile[]>(
      `${MEMBERS}.*`,
      "profiles.full_name as full_name",
      "profiles.email as profile_email",
    );
}

export function listProjectMembers(
  projectId: number,
): Promise<ProjectMemberWithProfile[]> {
  return projectMemberQuery()
    .where(`${MEMBERS}.project_id`, projectId)
    .orderBy(`${MEMBERS}.created_at`, "asc");
}

export function findProjectMember(
  projectId: number,
  profileId: number,
): Promise<ProjectMemberRecord | undefined> {
  return db<ProjectMemberRecord>(MEMBERS)
    .where({ project_id: projectId, profile_id: profileId })
    .first();
}

export async function insertProjectMember(input: {
  projectId: number;
  profileId: number;
  addedBy: number;
}): Promise<ProjectMemberRecord> {
  const [row] = await db<ProjectMemberRecord>(MEMBERS)
    .insert({
      project_id: input.projectId,
      profile_id: input.profileId,
      added_by: input.addedBy,
    })
    .returning("*");

  if (!row) {
    throw new Error("The project member row was not returned after insert.");
  }

  return row;
}

/** Removes one contributor. Returns the number of rows removed. */
export function deleteProjectMember(
  projectId: number,
  profileId: number,
): Promise<number> {
  return db(MEMBERS)
    .where({ project_id: projectId, profile_id: profileId })
    .delete();
}

/* ------------------------------------------------------------------------
   Outcomes — a goal record, never an execution engine.
   --------------------------------------------------------------------- */

export function listOutcomesForProject(
  projectId: number,
): Promise<ProjectOutcomeRecord[]> {
  return db<ProjectOutcomeRecord>(OUTCOMES)
    .where({ project_id: projectId })
    .orderBy("created_at", "asc");
}

export function findOutcomeById(
  id: number,
): Promise<ProjectOutcomeRecord | undefined> {
  return db<ProjectOutcomeRecord>(OUTCOMES).where({ id }).first();
}

export async function insertOutcome(input: {
  projectId: number;
  organisationId: number;
  title: string;
  description: string | null;
  ownerProfileId: number | null;
  targetDate: string | null;
  status: string;
  createdBy: number;
}): Promise<ProjectOutcomeRecord> {
  const [row] = await db<ProjectOutcomeRecord>(OUTCOMES)
    .insert({
      project_id: input.projectId,
      organisation_id: input.organisationId,
      title: input.title,
      description: input.description,
      owner_profile_id: input.ownerProfileId,
      target_date: input.targetDate,
      status: input.status,
      created_by: input.createdBy,
    })
    .returning("*");

  if (!row) {
    throw new Error("The outcome row was not returned after insert.");
  }

  return row;
}

type OutcomePatch = Partial<
  Pick<
    ProjectOutcomeRecord,
    "title" | "description" | "owner_profile_id" | "target_date" | "status"
  >
>;

export async function updateOutcome(
  id: number,
  patch: OutcomePatch,
): Promise<ProjectOutcomeRecord> {
  const [row] = await db<ProjectOutcomeRecord>(OUTCOMES)
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() as unknown as string })
    .returning("*");

  if (!row) {
    throw new Error(`Outcome ${id} disappeared during update.`);
  }

  return row;
}

/* ------------------------------------------------------------------------
   Events — the traceable timeline. Append-only; nothing here is ever
   updated or deleted.
   --------------------------------------------------------------------- */

export async function insertProjectEvent(input: {
  projectId: number;
  organisationId: number;
  actorProfileId: number;
  type: string;
  message: string;
}): Promise<ProjectEventRecord> {
  const [row] = await db<ProjectEventRecord>(EVENTS)
    .insert({
      project_id: input.projectId,
      organisation_id: input.organisationId,
      actor_profile_id: input.actorProfileId,
      type: input.type,
      message: input.message,
    })
    .returning("*");

  if (!row) {
    throw new Error("The project event row was not returned after insert.");
  }

  return row;
}

/** The most recent events first — a timeline reads newest-on-top. */
export function listProjectEvents(
  projectId: number,
  limit = 100,
): Promise<ProjectEventRecord[]> {
  return db<ProjectEventRecord>(EVENTS)
    .where({ project_id: projectId })
    .orderBy("created_at", "desc")
    .limit(limit);
}
