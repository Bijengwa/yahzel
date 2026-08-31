import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import { OrganisationError } from "../organisation/organisation.service.js";
import {
  DepartmentError,
  addDepartmentMember,
  createDepartment,
  getDepartmentMembers,
  listDepartments,
  removeDepartment,
  removeDepartmentMemberFromDepartment,
  updateDepartmentDetails,
} from "./department.service.js";

/**
 * One place where a thrown error becomes a response — the same shape the
 * hierarchy controllers use. `OrganisationError` is included because the
 * capability helpers (requireStructureCapability / requireOccupancyCapability)
 * throw that type for the "not a member" / "not an admin" cases. Anything else
 * is logged and answered generically, so database details never reach the
 * browser.
 */
function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof DepartmentError || error instanceof OrganisationError) {
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
    throw DepartmentError.field(404, "form", `That ${label} could not be found.`);
  }

  return value;
}

export async function index(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");

    res
      .status(200)
      .json(await listDepartments(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to list departments");
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");

    const result = await createDepartment(
      currentUserId(req),
      organisationId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create department");
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const departmentId = readId(req.params.departmentId, "department");

    const result = await updateDepartmentDetails(
      currentUserId(req),
      organisationId,
      departmentId,
      req.body ?? {},
    );

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to update department");
  }
}

export async function destroy(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const departmentId = readId(req.params.departmentId, "department");

    const result = await removeDepartment(
      currentUserId(req),
      organisationId,
      departmentId,
    );

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to delete department");
  }
}

export async function members(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const departmentId = readId(req.params.departmentId, "department");

    res
      .status(200)
      .json(
        await getDepartmentMembers(
          currentUserId(req),
          organisationId,
          departmentId,
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to list department members");
  }
}

export async function addMember(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const departmentId = readId(req.params.departmentId, "department");

    const result = await addDepartmentMember(
      currentUserId(req),
      organisationId,
      departmentId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to add department member");
  }
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const departmentId = readId(req.params.departmentId, "department");
    const memberId = readId(req.params.memberId, "member");

    const result = await removeDepartmentMemberFromDepartment(
      currentUserId(req),
      organisationId,
      departmentId,
      memberId,
    );

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to remove department member");
  }
}
