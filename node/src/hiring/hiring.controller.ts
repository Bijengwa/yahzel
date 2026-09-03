import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import {
  HiringError,
  acceptOffer,
  applyToPosting,
  createJobPosting,
  createOffer,
  declineOffer,
  getApplication,
  getPosting,
  listMyApplications,
  listOpenPostings,
  listOrganisationApplications,
  listPostingsForAdmin,
  listApplicationsForPostingAsAdmin,
  reviewApplication,
  scheduleInterview,
  updateInterviewOutcome,
  updatePostingStatus,
  withdrawApplication,
  withdrawOffer,
} from "./hiring.service.js";

function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof HiringError) {
    res.status(error.status).json({ message: error.message, errors: error.errors });
    return;
  }

  console.error(`${context}:`, error);

  res.status(500).json({ message: "Something went wrong. Please try again.", errors: [] });
}

function readId(raw: unknown, label: string): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw HiringError.field(404, "form", `That ${label} could not be found.`);
  }

  return value;
}

/* ------------------------------------------------------------------------
   Job postings
   --------------------------------------------------------------------- */

export async function postingsIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const admin = req.query.admin === "1" || req.query.admin === "true";

    const result = admin
      ? await listPostingsForAdmin(currentUserId(req), organisationId)
      : await listOpenPostings(currentUserId(req), organisationId);

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to list job postings");
  }
}

export async function postingsCreate(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");

    const result = await createJobPosting(currentUserId(req), organisationId, req.body ?? {});

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create job posting");
  }
}

export async function postingsShow(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const postingId = readId(req.params.postingId, "job posting");

    res.status(200).json(await getPosting(currentUserId(req), organisationId, postingId));
  } catch (error) {
    handleFailure(res, error, "Failed to load job posting");
  }
}

export async function postingsUpdateStatus(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const postingId = readId(req.params.postingId, "job posting");

    res
      .status(200)
      .json(
        await updatePostingStatus(currentUserId(req), organisationId, postingId, req.body ?? {}),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to update job posting");
  }
}

/* ------------------------------------------------------------------------
   Applications
   --------------------------------------------------------------------- */

export async function applicationsCreate(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const postingId = readId(req.params.postingId, "job posting");

    const result = await applyToPosting(
      currentUserId(req),
      organisationId,
      postingId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to submit application");
  }
}

export async function postingApplicationsIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const postingId = readId(req.params.postingId, "job posting");

    res
      .status(200)
      .json(
        await listApplicationsForPostingAsAdmin(currentUserId(req), organisationId, postingId),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to list applications");
  }
}

export async function organisationApplicationsIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");

    res.status(200).json(await listOrganisationApplications(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to list applications");
  }
}

export async function myApplicationsIndex(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json(await listMyApplications(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to list your applications");
  }
}

export async function applicationsShow(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const applicationId = readId(req.params.applicationId, "application");

    res
      .status(200)
      .json(await getApplication(currentUserId(req), organisationId, applicationId));
  } catch (error) {
    handleFailure(res, error, "Failed to load application");
  }
}

export async function applicationsReview(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const applicationId = readId(req.params.applicationId, "application");

    res
      .status(200)
      .json(
        await reviewApplication(
          currentUserId(req),
          organisationId,
          applicationId,
          req.body ?? {},
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to review application");
  }
}

export async function applicationsWithdraw(req: Request, res: Response): Promise<void> {
  try {
    const applicationId = readId(req.params.applicationId, "application");

    res.status(200).json(await withdrawApplication(currentUserId(req), applicationId));
  } catch (error) {
    handleFailure(res, error, "Failed to withdraw application");
  }
}

/* ------------------------------------------------------------------------
   Interviews
   --------------------------------------------------------------------- */

export async function interviewsCreate(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const applicationId = readId(req.params.applicationId, "application");

    const result = await scheduleInterview(
      currentUserId(req),
      organisationId,
      applicationId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to schedule interview");
  }
}

export async function interviewsUpdate(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const interviewId = readId(req.params.interviewId, "interview");

    res
      .status(200)
      .json(
        await updateInterviewOutcome(
          currentUserId(req),
          organisationId,
          interviewId,
          req.body ?? {},
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to update interview");
  }
}

/* ------------------------------------------------------------------------
   Offers
   --------------------------------------------------------------------- */

export async function offersCreate(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const applicationId = readId(req.params.applicationId, "application");

    const result = await createOffer(
      currentUserId(req),
      organisationId,
      applicationId,
      req.body ?? {},
    );

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create offer");
  }
}

export async function offersAccept(req: Request, res: Response): Promise<void> {
  try {
    const offerId = readId(req.params.offerId, "offer");

    res.status(200).json(await acceptOffer(currentUserId(req), offerId));
  } catch (error) {
    handleFailure(res, error, "Failed to accept offer");
  }
}

export async function offersDecline(req: Request, res: Response): Promise<void> {
  try {
    const offerId = readId(req.params.offerId, "offer");

    res.status(200).json(await declineOffer(currentUserId(req), offerId));
  } catch (error) {
    handleFailure(res, error, "Failed to decline offer");
  }
}

export async function offersWithdraw(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const offerId = readId(req.params.offerId, "offer");

    res.status(200).json(await withdrawOffer(currentUserId(req), organisationId, offerId));
  } catch (error) {
    handleFailure(res, error, "Failed to withdraw offer");
  }
}
