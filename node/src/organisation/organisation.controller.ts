import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import {
  OrganisationError,
  acceptInvitation,
  declineInvitation,
  getOrganisation,
  getOrganisationPeople,
  inviteToOrganisation,
  listMyParticipation,
  registerOrganisation,
  removeFromOrganisation,
} from "./organisation.service.js";

/**
 * One place where a thrown error becomes a response. Anything that is not a
 * deliberate `OrganisationError` is logged and answered with a generic
 * message, so database details never reach the browser.
 */
function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof OrganisationError) {
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
    throw OrganisationError.field(404, "form", `That ${label} could not be found.`);
  }

  return value;
}

export async function index(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json({
      participation: await listMyParticipation(currentUserId(req)),
    });
  } catch (error) {
    handleFailure(res, error, "Failed to list organisations");
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const result = await registerOrganisation(currentUserId(req), req.body ?? {});

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to register organisation");
  }
}

export async function show(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id, "organisation");

    res.status(200).json(await getOrganisation(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to load organisation");
  }
}

export async function people(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id, "organisation");

    res.status(200).json(await getOrganisationPeople(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to list organisation people");
  }
}

export async function invite(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id, "organisation");

    const result = await inviteToOrganisation(
      currentUserId(req),
      id,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to invite someone to organisation");
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id, "organisation");
    const memberId = readId(req.params.memberId, "person");

    res
      .status(200)
      .json(await removeFromOrganisation(currentUserId(req), id, memberId));
  } catch (error) {
    handleFailure(res, error, "Failed to remove someone from organisation");
  }
}

export async function accept(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id, "organisation");

    res.status(200).json(await acceptInvitation(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to accept invitation");
  }
}

export async function decline(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id, "organisation");

    res.status(200).json(await declineInvitation(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to decline invitation");
  }
}
