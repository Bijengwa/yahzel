import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import { OrganisationError } from "../organisation/organisation.service.js";
import {
  EmploymentError,
  createContract,
  createEmploymentRecord,
  getEmploymentForMember,
  listEmploymentContracts,
  updateContractDetails,
  updateEmploymentRecordDetails,
} from "./employment.service.js";

/**
 * One place where a thrown error becomes a response — the same shape
 * department.controller.ts and occupancy.controller.ts already use.
 * `OrganisationError` is included because requireOccupancyCapability throws
 * that type directly for the "not a member" / "not an admin" cases.
 */
function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof EmploymentError || error instanceof OrganisationError) {
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
    throw EmploymentError.field(404, "form", `That ${label} could not be found.`);
  }

  return value;
}

export async function showForMember(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const memberId = readId(req.params.memberId, "member");

    res
      .status(200)
      .json(
        await getEmploymentForMember(currentUserId(req), organisationId, memberId),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to load employment record");
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const memberId = readId(req.params.memberId, "member");

    const result = await createEmploymentRecord(
      currentUserId(req),
      organisationId,
      memberId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create employment record");
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const employmentId = readId(req.params.employmentId, "employment record");

    const result = await updateEmploymentRecordDetails(
      currentUserId(req),
      organisationId,
      employmentId,
      req.body ?? {},
    );

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to update employment record");
  }
}

export async function indexContracts(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const employmentId = readId(req.params.employmentId, "employment record");

    res
      .status(200)
      .json(
        await listEmploymentContracts(
          currentUserId(req),
          organisationId,
          employmentId,
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to list contracts");
  }
}

export async function createContractHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const employmentId = readId(req.params.employmentId, "employment record");

    const result = await createContract(
      currentUserId(req),
      organisationId,
      employmentId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create contract");
  }
}

export async function updateContractHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const employmentId = readId(req.params.employmentId, "employment record");
    const contractId = readId(req.params.contractId, "contract");

    const result = await updateContractDetails(
      currentUserId(req),
      organisationId,
      employmentId,
      contractId,
      req.body ?? {},
    );

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to update contract");
  }
}
