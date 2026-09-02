import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import {
  ProjectError,
  addMember,
  archiveProject,
  createOutcome,
  createProject,
  getProjectHealth,
  getProjectOverview,
  linkWorkItem,
  listMembers,
  listOrganisationProjects,
  listOutcomes,
  listProjectHistory,
  listProjectWork,
  removeMember,
  unarchiveProject,
  unlinkWorkItem,
  updateOutcomeDetails,
  updateProjectDetails,
  updateProjectStatus,
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
      .json(
        await getProjectOverview(currentUserId(req), organisationId, projectId),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to load project");
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    res
      .status(200)
      .json(
        await updateProjectDetails(
          currentUserId(req),
          organisationId,
          projectId,
          req.body ?? {},
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to update project");
  }
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    res
      .status(200)
      .json(
        await updateProjectStatus(
          currentUserId(req),
          organisationId,
          projectId,
          req.body ?? {},
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to change project status");
  }
}

export async function archive(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    res
      .status(200)
      .json(await archiveProject(currentUserId(req), organisationId, projectId));
  } catch (error) {
    handleFailure(res, error, "Failed to archive project");
  }
}

export async function unarchive(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    res
      .status(200)
      .json(await unarchiveProject(currentUserId(req), organisationId, projectId));
  } catch (error) {
    handleFailure(res, error, "Failed to restore project");
  }
}

export async function health(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    res
      .status(200)
      .json(await getProjectHealth(currentUserId(req), organisationId, projectId));
  } catch (error) {
    handleFailure(res, error, "Failed to load project health");
  }
}

export async function history(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    res
      .status(200)
      .json(
        await listProjectHistory(currentUserId(req), organisationId, projectId),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to load project history");
  }
}

/* ---------------------------------------------------------------- Members */

export async function membersIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    res
      .status(200)
      .json(await listMembers(currentUserId(req), organisationId, projectId));
  } catch (error) {
    handleFailure(res, error, "Failed to list project members");
  }
}

export async function membersCreate(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    const result = await addMember(
      currentUserId(req),
      organisationId,
      projectId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to add project member");
  }
}

export async function membersDelete(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");
    const memberProfileId = readId(req.params.memberProfileId, "member");

    res
      .status(200)
      .json(
        await removeMember(
          currentUserId(req),
          organisationId,
          projectId,
          memberProfileId,
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to remove project member");
  }
}

/* --------------------------------------------------------------- Outcomes */

export async function outcomesIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    res
      .status(200)
      .json(await listOutcomes(currentUserId(req), organisationId, projectId));
  } catch (error) {
    handleFailure(res, error, "Failed to list project outcomes");
  }
}

export async function outcomesCreate(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    const result = await createOutcome(
      currentUserId(req),
      organisationId,
      projectId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create outcome");
  }
}

export async function outcomesUpdate(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");
    const outcomeId = readId(req.params.outcomeId, "outcome");

    res
      .status(200)
      .json(
        await updateOutcomeDetails(
          currentUserId(req),
          organisationId,
          projectId,
          outcomeId,
          req.body ?? {},
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to update outcome");
  }
}

/* ------------------------------------------------------------------- Work */

export async function workIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");

    res
      .status(200)
      .json(await listProjectWork(currentUserId(req), organisationId, projectId));
  } catch (error) {
    handleFailure(res, error, "Failed to list project work");
  }
}

export async function workLink(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");
    const workItemId = readId(req.params.workItemId, "work item");

    res
      .status(200)
      .json(
        await linkWorkItem(
          currentUserId(req),
          organisationId,
          projectId,
          workItemId,
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to link work item");
  }
}

export async function workUnlink(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const projectId = readId(req.params.projectId, "project");
    const workItemId = readId(req.params.workItemId, "work item");

    res
      .status(200)
      .json(
        await unlinkWorkItem(
          currentUserId(req),
          organisationId,
          projectId,
          workItemId,
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to unlink work item");
  }
}
