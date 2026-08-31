import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import { OrganisationError } from "../organisation/organisation.service.js";
import {
  HierarchyError,
  assignOccupant,
  endOccupancy,
  getMemberOccupancyHistory,
  getPositionOccupancy,
  getPositionOccupancyHistory,
  listOrganisationOccupancy,
  replaceOccupant,
} from "./occupancy.service.js";

/**
 * One place where a thrown error becomes a response — the same shape
 * hierarchy.controller.ts uses. `OrganisationError` is included for the
 * same reason as there: requireOccupancyCapability throws it directly.
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

export async function showOccupancy(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const positionId = readId(req.params.positionId, "position");

    res
      .status(200)
      .json(
        await getPositionOccupancy(
          currentUserId(req),
          organisationId,
          positionId,
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to load position occupancy");
  }
}

export async function indexOccupancy(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");

    res
      .status(200)
      .json(await listOrganisationOccupancy(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to load organisation occupancy");
  }
}

export async function assign(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const positionId = readId(req.params.positionId, "position");

    const result = await assignOccupant(
      currentUserId(req),
      organisationId,
      positionId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to assign occupant");
  }
}

export async function replace(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const positionId = readId(req.params.positionId, "position");

    const result = await replaceOccupant(
      currentUserId(req),
      organisationId,
      positionId,
      req.body ?? {},
    );

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to replace occupant");
  }
}

export async function end(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const positionId = readId(req.params.positionId, "position");

    const result = await endOccupancy(
      currentUserId(req),
      organisationId,
      positionId,
    );

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to end occupancy");
  }
}

export async function positionHistory(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const positionId = readId(req.params.positionId, "position");

    res
      .status(200)
      .json(
        await getPositionOccupancyHistory(
          currentUserId(req),
          organisationId,
          positionId,
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to load position occupancy history");
  }
}

export async function memberHistory(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const memberId = readId(req.params.memberId, "member");

    res
      .status(200)
      .json(
        await getMemberOccupancyHistory(
          currentUserId(req),
          organisationId,
          memberId,
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to load member occupancy history");
  }
}
