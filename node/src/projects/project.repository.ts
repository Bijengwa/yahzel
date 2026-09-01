import type { Knex } from "knex";

import { db } from "../db/knex.js";
import { PROJECTS_TABLE, type ProjectRecord } from "./project.record.js";

const PROJECTS = PROJECTS_TABLE;

type Queryable = Knex | Knex.Transaction;

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
  createdBy: number;
}): Promise<ProjectRecord> {
  const [row] = await db<ProjectRecord>(PROJECTS)
    .insert({
      organisation_id: input.organisationId,
      name: input.name,
      description: input.description,
      status: input.status,
      created_by: input.createdBy,
    })
    .returning("*");

  if (!row) {
    throw new Error("The project row was not returned after insert.");
  }

  return row;
}
