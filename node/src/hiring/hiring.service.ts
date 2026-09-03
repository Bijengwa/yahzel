import { findProfileById } from "../profile/profile.repository.js";
import {
  findMembership,
  findOrganisationById,
  insertMembership,
  updateMembership,
} from "../organisation/organisation.repository.js";
import type { OrganisationMemberRecord } from "../organisation/organisation.record.js";
import { publicMembership } from "../organisation/organisation.service.js";
import { createNotification } from "../notifications/notification.service.js";
import { findDepartmentById } from "../departments/department.repository.js";
import { findPositionById } from "../hierarchy/hierarchy.repository.js";
import {
  findActiveOccupancyByMember,
  findActiveOccupancyByPosition,
  insertOccupancy,
} from "../hierarchy/occupancy.repository.js";
import {
  findApplicationById,
  findApplicationByPostingAndApplicant,
  findInterviewById,
  findJobPostingById,
  findOfferById,
  findOpenOfferForApplication,
  insertApplication,
  insertInterview,
  insertJobPosting,
  insertOffer,
  listApplicationsForApplicant,
  listApplicationsForOrganisation,
  listApplicationsForPosting,
  listInterviewsForApplication,
  listJobPostingsForOrganisation,
  listOffersForApplication,
  listOpenJobPostings,
  transitionOffer,
  updateApplicationStatus,
  updateInterview,
  updateJobPosting,
} from "./hiring.repository.js";
import type {
  JobApplicationRecord,
  JobInterviewRecord,
  JobOfferRecord,
  JobPostingRecord,
} from "./hiring.record.js";
import {
  validateCoverNote,
  validateDescription,
  validateDesignation,
  validateInterviewNotes,
  validateInterviewOutcome,
  validateOptionalDateTime,
  validateOptionalPositiveId,
  validateOrganisationClass,
  validateParticipationType,
  validatePositiveId,
  validatePostingStatus,
  validatePostingTitle,
  validateTitle,
  type FieldError,
} from "./hiring.validation.js";

export class HiringError extends Error {
  status: number;
  errors: FieldError[];

  constructor(status: number, errors: FieldError[]) {
    super(errors[0]?.message ?? "Request failed.");
    this.status = status;
    this.errors = errors;
  }

  static field(status: number, field: string, message: string): HiringError {
    return new HiringError(status, [{ field, message }]);
  }
}

const notFoundOrg = () =>
  HiringError.field(404, "form", "That organisation could not be found.");

const notFoundPosting = () =>
  HiringError.field(404, "form", "That job posting could not be found.");

const notFoundApplication = () =>
  HiringError.field(404, "form", "That application could not be found.");

const notAllowed = () =>
  HiringError.field(403, "form", "You are not allowed to perform this action.");

/* ------------------------------------------------------------------------
   Access — HIRING capability. Same resolved rule as STRUCTURE/OCCUPANCY in
   organisation.service.ts (system_role === "admin"), named for where it is
   used rather than layered into a new permission framework.
   --------------------------------------------------------------------- */

async function requireHiringCapability(
  userId: number,
  organisationId: number,
): Promise<OrganisationMemberRecord> {
  const organisation = await findOrganisationById(organisationId);
  const membership = organisation ? await findMembership(organisationId, userId) : undefined;

  if (!organisation || !membership) {
    throw notFoundOrg();
  }

  if (membership.status !== "active" || membership.system_role !== "admin") {
    throw HiringError.field(403, "form", "Only an administrator can do that.");
  }

  return membership;
}

async function requireOrganisation(organisationId: number) {
  const organisation = await findOrganisationById(organisationId);

  if (!organisation) {
    throw notFoundOrg();
  }

  return organisation;
}

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

function publicPosting(record: JobPostingRecord) {
  return {
    id: record.id,
    organisationId: record.organisation_id,
    title: record.title,
    description: record.description,
    departmentId: record.department_id,
    positionId: record.position_id,
    participationType: record.participation_type,
    status: record.status,
    createdBy: record.created_by,
    openedAt: record.opened_at,
    closedAt: record.closed_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function publicApplication(record: JobApplicationRecord) {
  return {
    id: record.id,
    jobPostingId: record.job_posting_id,
    organisationId: record.organisation_id,
    applicantProfileId: record.applicant_profile_id,
    coverNote: record.cover_note,
    status: record.status,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function publicInterview(record: JobInterviewRecord) {
  return {
    id: record.id,
    applicationId: record.application_id,
    scheduledAt: record.scheduled_at,
    notes: record.notes,
    outcome: record.outcome,
    createdBy: record.created_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function publicOffer(record: JobOfferRecord) {
  return {
    id: record.id,
    applicationId: record.application_id,
    positionId: record.position_id,
    title: record.title,
    participationType: record.participation_type,
    organisationClass: record.organisation_class,
    designation: record.designation,
    expectedStartAt: record.expected_start_at,
    status: record.status,
    createdBy: record.created_by,
    respondedAt: record.responded_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

/* ------------------------------------------------------------------------
   Job postings
   --------------------------------------------------------------------- */

export type CreatePostingInput = {
  title?: unknown;
  description?: unknown;
  departmentId?: unknown;
  positionId?: unknown;
  participationType?: unknown;
};

export async function createJobPosting(
  userId: number,
  organisationId: number,
  input: CreatePostingInput,
) {
  await requireHiringCapability(userId, organisationId);

  const title = validatePostingTitle(input.title);
  const description = validateDescription(input.description);
  const departmentId = validateOptionalPositiveId(input.departmentId, "departmentId");
  const positionId = validateOptionalPositiveId(input.positionId, "positionId");
  const participationType = validateParticipationType(input.participationType);

  const errors: FieldError[] = [title, description, departmentId, positionId, participationType].flatMap(
    (r) => (r.ok ? [] : r.errors),
  );

  if (
    !title.ok ||
    !description.ok ||
    !departmentId.ok ||
    !positionId.ok ||
    !participationType.ok
  ) {
    throw new HiringError(422, errors);
  }

  if (departmentId.value !== null) {
    const department = await findDepartmentById(departmentId.value);

    if (!department || department.organisation_id !== organisationId) {
      throw HiringError.field(422, "departmentId", "That department does not exist here.");
    }
  }

  if (positionId.value !== null) {
    const position = await findPositionById(positionId.value);

    if (!position || position.organisation_id !== organisationId) {
      throw HiringError.field(422, "positionId", "That position does not exist here.");
    }
  }

  const posting = await insertJobPosting({
    organisationId,
    title: title.value,
    description: description.value,
    departmentId: departmentId.value,
    positionId: positionId.value,
    participationType: participationType.value,
    createdBy: userId,
  });

  return { message: "Job posting created.", posting: publicPosting(posting) };
}

/** Admin listing — every posting regardless of status. */
export async function listPostingsForAdmin(userId: number, organisationId: number) {
  await requireHiringCapability(userId, organisationId);

  const rows = await listJobPostingsForOrganisation(organisationId);

  return { postings: rows.map(publicPosting) };
}

/** Applicant-facing listing — open postings only, no admin capability required. */
export async function listOpenPostings(userId: number, organisationId: number) {
  await requireOrganisation(organisationId);

  const rows = await listOpenJobPostings(organisationId);

  return { postings: rows.map(publicPosting) };
}

async function requirePosting(organisationId: number, postingId: number): Promise<JobPostingRecord> {
  const posting = await findJobPostingById(postingId);

  if (!posting || posting.organisation_id !== organisationId) {
    throw notFoundPosting();
  }

  return posting;
}

/** Anyone signed in may view an open posting; draft/closed require hiring capability. */
export async function getPosting(userId: number, organisationId: number, postingId: number) {
  await requireOrganisation(organisationId);
  const posting = await requirePosting(organisationId, postingId);

  if (posting.status !== "open") {
    await requireHiringCapability(userId, organisationId);
  }

  return { posting: publicPosting(posting) };
}

export type UpdatePostingStatusInput = { status?: unknown };

export async function updatePostingStatus(
  userId: number,
  organisationId: number,
  postingId: number,
  input: UpdatePostingStatusInput,
) {
  await requireHiringCapability(userId, organisationId);

  const posting = await requirePosting(organisationId, postingId);
  const status = validatePostingStatus(input.status);

  if (!status.ok) {
    throw new HiringError(422, status.errors);
  }

  const patch: Parameters<typeof updateJobPosting>[1] = { status: status.value };

  if (status.value === "open" && posting.opened_at === null) {
    patch.opened_at = new Date().toISOString();
  }

  if (status.value === "closed") {
    patch.closed_at = new Date().toISOString();
  } else if (posting.status === "closed") {
    patch.closed_at = null;
  }

  const updated = await updateJobPosting(postingId, patch);

  return { message: "Job posting updated.", posting: publicPosting(updated) };
}

/* ------------------------------------------------------------------------
   Applications
   --------------------------------------------------------------------- */

async function requireApplication(
  organisationId: number,
  applicationId: number,
): Promise<JobApplicationRecord> {
  const application = await findApplicationById(applicationId);

  if (!application || application.organisation_id !== organisationId) {
    throw notFoundApplication();
  }

  return application;
}

const APPLICATION_TERMINAL = new Set(["hired", "rejected", "withdrawn"]);

export type ApplyInput = { coverNote?: unknown };

export async function applyToPosting(
  userId: number,
  organisationId: number,
  postingId: number,
  input: ApplyInput,
) {
  const posting = await requirePosting(organisationId, postingId);

  if (posting.status !== "open") {
    throw HiringError.field(422, "form", "This job posting is not accepting applications.");
  }

  const coverNote = validateCoverNote(input.coverNote);

  if (!coverNote.ok) {
    throw new HiringError(422, coverNote.errors);
  }

  const existing = await findApplicationByPostingAndApplicant(postingId, userId);

  if (existing) {
    throw HiringError.field(409, "form", "You have already applied to this job posting.");
  }

  const application = await insertApplication({
    jobPostingId: postingId,
    organisationId,
    applicantProfileId: userId,
    coverNote: coverNote.value,
  });

  const applicant = await findProfileById(userId);

  await createNotification({
    recipientProfileId: posting.created_by,
    type: "hiring.application_submitted",
    message: `${applicant?.full_name ?? "Someone"} applied to "${posting.title}".`,
    organisationId,
    actionUrl: `/hiring/${organisationId}/applications/${application.id}`,
  });

  return { message: "Your application has been submitted.", application: publicApplication(application) };
}

/** The hiring reviewer's list for one posting. */
export async function listApplicationsForPostingAsAdmin(
  userId: number,
  organisationId: number,
  postingId: number,
) {
  await requireHiringCapability(userId, organisationId);
  await requirePosting(organisationId, postingId);

  const rows = await listApplicationsForPosting(postingId);

  return { applications: rows.map(publicApplication) };
}

/** Every application in the organisation, across postings — the hiring dashboard. */
export async function listOrganisationApplications(userId: number, organisationId: number) {
  await requireHiringCapability(userId, organisationId);

  const rows = await listApplicationsForOrganisation(organisationId);

  return { applications: rows.map(publicApplication) };
}

/** The signed-in person's own applications, across every organisation. */
export async function listMyApplications(userId: number) {
  const rows = await listApplicationsForApplicant(userId);

  return { applications: rows.map(publicApplication) };
}

async function requireApplicationView(
  userId: number,
  organisationId: number,
  applicationId: number,
): Promise<JobApplicationRecord> {
  const application = await requireApplication(organisationId, applicationId);

  if (application.applicant_profile_id === userId) {
    return application;
  }

  await requireHiringCapability(userId, organisationId);

  return application;
}

export async function getApplication(
  userId: number,
  organisationId: number,
  applicationId: number,
) {
  const application = await requireApplicationView(userId, organisationId, applicationId);

  const [interviews, offers] = await Promise.all([
    listInterviewsForApplication(application.id),
    listOffersForApplication(application.id),
  ]);

  return {
    application: publicApplication(application),
    interviews: interviews.map(publicInterview),
    offers: offers.map(publicOffer),
  };
}

/** Moves an application into review, or rejects it. Both are explicit reviewer decisions. */
export type ReviewApplicationInput = { status?: unknown };

export async function reviewApplication(
  userId: number,
  organisationId: number,
  applicationId: number,
  input: ReviewApplicationInput,
) {
  await requireHiringCapability(userId, organisationId);

  const application = await requireApplication(organisationId, applicationId);

  if (APPLICATION_TERMINAL.has(application.status)) {
    throw HiringError.field(422, "form", "This application has already been decided.");
  }

  const status = String(input.status ?? "").trim().toLowerCase();

  if (status !== "under_review" && status !== "rejected") {
    throw HiringError.field(
      422,
      "status",
      "Use under_review to start reviewing, or rejected to decline this application.",
    );
  }

  const updated = await updateApplicationStatus(applicationId, status);

  if (status === "rejected") {
    await createNotification({
      recipientProfileId: application.applicant_profile_id,
      type: "hiring.application_rejected",
      message: "Your application was not taken forward this time.",
      organisationId,
      actionUrl: `/hiring/applications/${application.id}`,
    });
  }

  return {
    message: status === "rejected" ? "The application has been rejected." : "The application is now under review.",
    application: publicApplication(updated),
  };
}

export async function withdrawApplication(userId: number, applicationId: number) {
  const application = await findApplicationById(applicationId);

  if (!application || application.applicant_profile_id !== userId) {
    throw notFoundApplication();
  }

  if (APPLICATION_TERMINAL.has(application.status)) {
    throw HiringError.field(422, "form", "This application has already been decided.");
  }

  const updated = await updateApplicationStatus(applicationId, "withdrawn");

  return { message: "Your application has been withdrawn.", application: publicApplication(updated) };
}

/* ------------------------------------------------------------------------
   Interviews
   --------------------------------------------------------------------- */

export type ScheduleInterviewInput = { scheduledAt?: unknown; notes?: unknown };

export async function scheduleInterview(
  userId: number,
  organisationId: number,
  applicationId: number,
  input: ScheduleInterviewInput,
) {
  await requireHiringCapability(userId, organisationId);

  const application = await requireApplication(organisationId, applicationId);

  if (APPLICATION_TERMINAL.has(application.status) || application.status === "offered") {
    throw HiringError.field(
      422,
      "form",
      "This application is past the interview stage.",
    );
  }

  const scheduledAt = validateOptionalDateTime(input.scheduledAt, "scheduledAt");
  const notes = validateInterviewNotes(input.notes);

  const errors: FieldError[] = [scheduledAt, notes].flatMap((r) => (r.ok ? [] : r.errors));

  if (!scheduledAt.ok || !notes.ok) {
    throw new HiringError(422, errors);
  }

  const interview = await insertInterview({
    applicationId,
    organisationId,
    scheduledAt: scheduledAt.value,
    notes: notes.value,
    createdBy: userId,
  });

  if (application.status !== "interviewing") {
    await updateApplicationStatus(applicationId, "interviewing");
  }

  await createNotification({
    recipientProfileId: application.applicant_profile_id,
    type: "hiring.interview_scheduled",
    message: scheduledAt.value
      ? `An interview has been scheduled for ${new Date(scheduledAt.value).toLocaleString()}.`
      : "An interview stage has been added to your application.",
    organisationId,
    actionUrl: `/hiring/applications/${applicationId}`,
  });

  return { message: "Interview scheduled.", interview: publicInterview(interview) };
}

export type UpdateInterviewInput = { scheduledAt?: unknown; notes?: unknown; outcome?: unknown };

export async function updateInterviewOutcome(
  userId: number,
  organisationId: number,
  interviewId: number,
  input: UpdateInterviewInput,
) {
  await requireHiringCapability(userId, organisationId);

  const interview = await findInterviewById(interviewId);

  if (!interview || interview.organisation_id !== organisationId) {
    throw HiringError.field(404, "form", "That interview could not be found.");
  }

  const patch: Parameters<typeof updateInterview>[1] = {};
  const errors: FieldError[] = [];

  if (input.scheduledAt !== undefined) {
    const result = validateOptionalDateTime(input.scheduledAt, "scheduledAt");
    if (result.ok) patch.scheduled_at = result.value;
    else errors.push(...result.errors);
  }

  if (input.notes !== undefined) {
    const result = validateInterviewNotes(input.notes);
    if (result.ok) patch.notes = result.value;
    else errors.push(...result.errors);
  }

  if (input.outcome !== undefined) {
    const result = validateInterviewOutcome(input.outcome);
    if (result.ok) patch.outcome = result.value;
    else errors.push(...result.errors);
  }

  if (errors.length > 0) {
    throw new HiringError(422, errors);
  }

  const updated = await updateInterview(interviewId, patch);

  return { message: "Interview updated.", interview: publicInterview(updated) };
}

/* ------------------------------------------------------------------------
   Offers
   --------------------------------------------------------------------- */

export type CreateOfferInput = {
  positionId?: unknown;
  title?: unknown;
  participationType?: unknown;
  organisationClass?: unknown;
  designation?: unknown;
  expectedStartAt?: unknown;
};

export async function createOffer(
  userId: number,
  organisationId: number,
  applicationId: number,
  input: CreateOfferInput,
) {
  await requireHiringCapability(userId, organisationId);

  const application = await requireApplication(organisationId, applicationId);

  if (APPLICATION_TERMINAL.has(application.status)) {
    throw HiringError.field(422, "form", "This application has already been decided.");
  }

  const existingOpenOffer = await findOpenOfferForApplication(applicationId);

  if (existingOpenOffer) {
    throw HiringError.field(422, "form", "There is already an open offer for this application.");
  }

  const positionId = validateOptionalPositiveId(input.positionId, "positionId");
  const title = validateTitle(input.title);
  const participationType = validateParticipationType(input.participationType);
  const organisationClass = validateOrganisationClass(input.organisationClass);
  const designation = validateDesignation(input.designation);
  const expectedStartAt = validateOptionalDateTime(input.expectedStartAt, "expectedStartAt");

  const errors: FieldError[] = [
    positionId,
    title,
    participationType,
    organisationClass,
    designation,
    expectedStartAt,
  ].flatMap((r) => (r.ok ? [] : r.errors));

  if (
    !positionId.ok ||
    !title.ok ||
    !participationType.ok ||
    !organisationClass.ok ||
    !designation.ok ||
    !expectedStartAt.ok
  ) {
    throw new HiringError(422, errors);
  }

  if (positionId.value !== null) {
    const position = await findPositionById(positionId.value);

    if (!position || position.organisation_id !== organisationId) {
      throw HiringError.field(422, "positionId", "That position does not exist here.");
    }
  }

  const offer = await insertOffer({
    applicationId,
    organisationId,
    positionId: positionId.value,
    title: title.value,
    participationType: participationType.value,
    organisationClass: organisationClass.value,
    designation: designation.value,
    expectedStartAt: expectedStartAt.value,
    createdBy: userId,
  });

  await updateApplicationStatus(applicationId, "offered");

  await createNotification({
    recipientProfileId: application.applicant_profile_id,
    type: "hiring.offer_extended",
    message: "You have received a job offer.",
    organisationId,
    actionUrl: `/hiring/applications/${applicationId}`,
  });

  return { message: "Offer extended.", offer: publicOffer(offer) };
}

async function requireOwnOffer(userId: number, offerId: number) {
  const offer = await findOfferById(offerId);

  if (!offer) {
    throw HiringError.field(404, "form", "That offer could not be found.");
  }

  const application = await findApplicationById(offer.application_id);

  if (!application || application.applicant_profile_id !== userId) {
    throw HiringError.field(404, "form", "That offer could not be found.");
  }

  if (offer.status !== "pending") {
    throw HiringError.field(422, "form", "This offer has already been decided.");
  }

  return { offer, application };
}

/**
 * Accepting an offer is the moment hiring actually becomes a member: it
 * calls the exact same insertMembership/updateMembership the invite/accept
 * flow uses (organisation.service.ts acceptInvitation), so there remains
 * exactly one place a membership is created. If the offer names a position
 * and that position is currently free, it is assigned in the same step;
 * otherwise the hire still succeeds and the position is left for the
 * organisation to assign by hand — a race for an already-filled position
 * must never block the hire itself.
 */
export async function acceptOffer(userId: number, offerId: number) {
  const { offer, application } = await requireOwnOffer(userId, offerId);

  const accepted = await transitionOffer(offerId, "accepted");
  await updateApplicationStatus(application.id, "hired");

  const [existing, applicantProfile] = await Promise.all([
    findMembership(offer.organisation_id, userId),
    findProfileById(userId),
  ]);

  const membership = existing
    ? await updateMembership(existing.id, {
        system_role: "member",
        participation_type: offer.participation_type,
        organisation_class: offer.organisation_class,
        designation: offer.designation,
        title: offer.title,
        status: "active",
        joined_at: new Date().toISOString(),
        left_at: null,
      })
    : await insertMembership({
        organisationId: offer.organisation_id,
        profileId: userId,
        email: applicantProfile?.email ?? null,
        systemRole: "member",
        participationType: offer.participation_type,
        organisationClass: offer.organisation_class,
        designation: offer.designation,
        title: offer.title,
        expectedEndAt: null,
        invitedBy: offer.created_by,
      });

  let occupancyAssigned = false;

  if (offer.position_id !== null) {
    const [positionTaken, memberElsewhere] = await Promise.all([
      findActiveOccupancyByPosition(offer.position_id),
      findActiveOccupancyByMember(offer.organisation_id, membership.id),
    ]);

    if (!positionTaken && !memberElsewhere) {
      await insertOccupancy({
        organisationId: offer.organisation_id,
        positionId: offer.position_id,
        memberId: membership.id,
      });
      occupancyAssigned = true;
    }
  }

  await createNotification({
    recipientProfileId: offer.created_by,
    type: "hiring.offer_accepted",
    message: `${applicantProfile?.full_name ?? "The candidate"} accepted the offer and joined the organisation.`,
    organisationId: offer.organisation_id,
    actionUrl: `/organisation/${offer.organisation_id}`,
  });

  return {
    message: occupancyAssigned
      ? "Offer accepted. You are now a member and have been placed in the position."
      : "Offer accepted. You are now a member of the organisation.",
    offer: publicOffer(accepted),
    membership: publicMembership(membership),
    occupancyAssigned,
  };
}

export async function declineOffer(userId: number, offerId: number) {
  const { offer, application } = await requireOwnOffer(userId, offerId);

  const declined = await transitionOffer(offerId, "declined");

  // Declining is the candidate's own choice, not a rejection by the
  // organisation — the application goes back under review rather than
  // being closed out, so the organisation may extend a different offer.
  await updateApplicationStatus(application.id, "under_review");

  await createNotification({
    recipientProfileId: offer.created_by,
    type: "hiring.offer_declined",
    message: "A candidate declined the offer extended to them.",
    organisationId: offer.organisation_id,
    actionUrl: `/hiring/applications/${application.id}`,
  });

  return { message: "Offer declined.", offer: publicOffer(declined) };
}

export async function withdrawOffer(userId: number, organisationId: number, offerId: number) {
  await requireHiringCapability(userId, organisationId);

  const offer = await findOfferById(offerId);

  if (!offer || offer.organisation_id !== organisationId) {
    throw HiringError.field(404, "form", "That offer could not be found.");
  }

  if (offer.status !== "pending") {
    throw HiringError.field(422, "form", "This offer has already been decided.");
  }

  const withdrawn = await transitionOffer(offerId, "withdrawn");

  const application = await findApplicationById(offer.application_id);

  if (application && application.status === "offered") {
    await updateApplicationStatus(application.id, "under_review");
  }

  return { message: "Offer withdrawn.", offer: publicOffer(withdrawn) };
}

export { validatePositiveId };
