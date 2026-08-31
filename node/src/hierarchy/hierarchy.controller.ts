import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import { OrganisationError } from "../organisation/organisation.service.js";
import {
  HierarchyError,
  createHierarchyPosition,
  deleteHierarchyPosition,
  getHierarchy,
  updateHierarchyPosition,
} from "./hierarchy.service.js";

/**
 * One place where a thrown error becomes a response. `OrganisationError` is
 * included because requireAdminMembership now delegates to
 * organisation.service.ts's requireStructureCapability, which throws that
 * type for the "not a member" / "not an admin" cases — it is not a leak,
 * it is the authority on authorization surfacing its own error shape.
 * Anything that is neither is logged and answered with a generic message,
 * so database details never reach the browser.
 */
function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof HierarchyError || error instanceof OrganisationError) {
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
    throw HierarchyError.field(
      404,
      "form",
      `That ${label} could not be found.`,
    );
  }

  return value;
}

export async function index(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");

    res
      .status(200)
      .json(await getHierarchy(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to load hierarchy");
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");

    const result = await createHierarchyPosition(
      currentUserId(req),
      organisationId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create position");
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const positionId = readId(req.params.positionId, "position");

    const result = await updateHierarchyPosition(
      currentUserId(req),
      organisationId,
      positionId,
      req.body ?? {},
    );

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to update position");
  }
}

export async function destroy(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const positionId = readId(req.params.positionId, "position");

    const result = await deleteHierarchyPosition(
      currentUserId(req),
      organisationId,
      positionId,
    );

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to delete position");
  }
}
