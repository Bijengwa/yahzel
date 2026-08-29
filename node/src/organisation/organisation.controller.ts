import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import {
  OrganisationError,
  acceptInvitation,
  cancelInvitation,
  concludeMembership,
  declineInvitation,
  getOrganisation,
  getOrganisationInvitations,
  getOrganisationPeople,
  inviteToOrganisation,
  listMyInvitations,
  listMyParticipation,
  registerOrganisation,
  updateStanding,
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
    throw OrganisationError.field(
      404,
      "form",
      `That ${label} could not be found.`,
    );
  }

  return value;
}

/**
 * Answering an invitation works either way round: by naming the invitation,
 * or by naming the organisation and letting Yahzel find the one waiting.
 */
function invitationTarget(req: Request): {
  invitationId?: number;
  organisationId?: number;
} {
  return req.params.invitationId
    ? { invitationId: readId(req.params.invitationId, "invitation") }
    : { organisationId: readId(req.params.id, "organisation") };
}

export async function index(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json(await listMyParticipation(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to list organisations");
  }
}

export async function myInvitations(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    res.status(200).json(await listMyInvitations(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to list invitations");
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const result = await registerOrganisation(
      currentUserId(req),
      req.body ?? {},
    );

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

/** Class, position, title, participation type or status. */
export async function standing(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id, "organisation");
    const memberId = readId(req.params.memberId, "person");

    res
      .status(200)
      .json(
        await updateStanding(currentUserId(req), id, memberId, req.body ?? {}),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to update a standing");
  }
}

export async function conclude(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id, "organisation");
    const memberId = readId(req.params.memberId, "person");

    res
      .status(200)
      .json(await concludeMembership(currentUserId(req), id, memberId));
  } catch (error) {
    handleFailure(res, error, "Failed to conclude a membership");
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

export async function invitations(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id, "organisation");

    res
      .status(200)
      .json(await getOrganisationInvitations(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to list organisation invitations");
  }
}

export async function withdraw(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id, "organisation");
    const invitationId = readId(req.params.invitationId, "invitation");

    res
      .status(200)
      .json(await cancelInvitation(currentUserId(req), id, invitationId));
  } catch (error) {
    handleFailure(res, error, "Failed to withdraw an invitation");
  }
}

export async function accept(req: Request, res: Response): Promise<void> {
  try {
    res
      .status(200)
      .json(await acceptInvitation(currentUserId(req), invitationTarget(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to accept invitation");
  }
}

export async function decline(req: Request, res: Response): Promise<void> {
  try {
    res
      .status(200)
      .json(await declineInvitation(currentUserId(req), invitationTarget(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to decline invitation");
  }
}
