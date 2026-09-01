import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import {
  ProjectError,
  createProject,
  getProject,
  listOrganisationProjects,
} from "./project.service.js";

/**
 * One place where a thrown error becomes a response. Anything that is not a
 * deliberate `ProjectError` is logged and answered with a generic message, so
 * database details never reach the browser.
 */
function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof ProjectError) {
    res.status(error.status).json({
      message: error.message,
      errors: error.errors,
    });
    return;
  }

  console.error(`${context}:`, error);

  res.status(500).json({
    message: "Something went wrong. Please try again.",
    errors: [],
  });
}

/** Route parameters are untrusted text until proven otherwise. */
function readId(raw: unknown, label: string): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw ProjectError.field(404, "form", `That ${label} could not be found.`);
  }

  return value;
}

export async function index(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");

    res
      .status(200)
      .json(await listOrganisationProjects(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to list projects");
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");

    const result = await createProject(
      currentUserId(req),
      organisationId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create project");
  }
}

export async function show(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    res
      .status(200)
      .json(await getProject(currentUserId(req), organisationId, projectId));
  } catch (error) {
    handleFailure(res, error, "Failed to load project");
  }
}
