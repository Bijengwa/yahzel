import { db } from "../db/knex.js";
import {
  JOB_APPLICATIONS_TABLE,
  JOB_INTERVIEWS_TABLE,
  JOB_OFFERS_TABLE,
  JOB_POSTINGS_TABLE,
  type JobApplicationRecord,
  type JobInterviewRecord,
  type JobOfferRecord,
  type JobPostingRecord,
} from "./hiring.record.js";

const POSTINGS = JOB_POSTINGS_TABLE;
const APPLICATIONS = JOB_APPLICATIONS_TABLE;
const INTERVIEWS = JOB_INTERVIEWS_TABLE;
const OFFERS = JOB_OFFERS_TABLE;

const now = () => db.fn.now() as unknown as string;

/* ------------------------------------------------------------------------
   Job postings
   --------------------------------------------------------------------- */

export function findJobPostingById(id: number) {
  return db<JobPostingRecord>(POSTINGS).where({ id }).first();
}

export function listJobPostingsForOrganisation(
  organisationId: number,
): Promise<JobPostingRecord[]> {
  return db<JobPostingRecord>(POSTINGS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");
}

/** Open postings only — the applicant-facing listing needs no admin capability. */
export function listOpenJobPostings(organisationId: number): Promise<JobPostingRecord[]> {
  return db<JobPostingRecord>(POSTINGS)
    .where({ organisation_id: organisationId, status: "open" })
    .orderBy("created_at", "desc");
}

export async function insertJobPosting(input: {
  organisationId: number;
  title: string;
  description: string | null;
  departmentId: number | null;
  positionId: number | null;
  participationType: string;
  createdBy: number;
}): Promise<JobPostingRecord> {
  const [row] = await db<JobPostingRecord>(POSTINGS)
    .insert({
      organisation_id: input.organisationId,
      title: input.title,
      description: input.description,
      department_id: input.departmentId,
      position_id: input.positionId,
      participation_type: input.participationType,
      created_by: input.createdBy,
    })
    .returning("*");

  if (!row) {
    throw new Error("The job posting row was not returned after insert.");
  }

  return row;
}

export async function updateJobPosting(
  id: number,
  patch: Partial<{
    title: string;
    description: string | null;
    department_id: number | null;
    position_id: number | null;
    participation_type: string;
    status: string;
    opened_at: string | null;
    closed_at: string | null;
  }>,
): Promise<JobPostingRecord> {
  const [row] = await db<JobPostingRecord>(POSTINGS)
    .where({ id })
    .update({ ...patch, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Job posting ${id} disappeared during update.`);
  }

  return row;
}

/* ------------------------------------------------------------------------
   Applications
   --------------------------------------------------------------------- */

export function findApplicationById(id: number) {
  return db<JobApplicationRecord>(APPLICATIONS).where({ id }).first();
}

export function findApplicationByPostingAndApplicant(
  jobPostingId: number,
  applicantProfileId: number,
) {
  return db<JobApplicationRecord>(APPLICATIONS)
    .where({ job_posting_id: jobPostingId, applicant_profile_id: applicantProfileId })
    .first();
}

export function listApplicationsForPosting(
  jobPostingId: number,
): Promise<JobApplicationRecord[]> {
  return db<JobApplicationRecord>(APPLICATIONS)
    .where({ job_posting_id: jobPostingId })
    .orderBy("created_at", "asc");
}

export function listApplicationsForOrganisation(
  organisationId: number,
): Promise<JobApplicationRecord[]> {
  return db<JobApplicationRecord>(APPLICATIONS)
    .where({ organisation_id: organisationId })
    .orderBy("created_at", "desc");
}

export function listApplicationsForApplicant(
  applicantProfileId: number,
): Promise<JobApplicationRecord[]> {
  return db<JobApplicationRecord>(APPLICATIONS)
    .where({ applicant_profile_id: applicantProfileId })
    .orderBy("created_at", "desc");
}

export async function insertApplication(input: {
  jobPostingId: number;
  organisationId: number;
  applicantProfileId: number;
  coverNote: string | null;
}): Promise<JobApplicationRecord> {
  const [row] = await db<JobApplicationRecord>(APPLICATIONS)
    .insert({
      job_posting_id: input.jobPostingId,
      organisation_id: input.organisationId,
      applicant_profile_id: input.applicantProfileId,
      cover_note: input.coverNote,
    })
    .returning("*");

  if (!row) {
    throw new Error("The application row was not returned after insert.");
  }

  return row;
}

export async function updateApplicationStatus(
  id: number,
  status: string,
): Promise<JobApplicationRecord> {
  const [row] = await db<JobApplicationRecord>(APPLICATIONS)
    .where({ id })
    .update({ status, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Application ${id} disappeared during update.`);
  }

  return row;
}

/* ------------------------------------------------------------------------
   Interviews
   --------------------------------------------------------------------- */

export function findInterviewById(id: number) {
  return db<JobInterviewRecord>(INTERVIEWS).where({ id }).first();
}

export function listInterviewsForApplication(
  applicationId: number,
): Promise<JobInterviewRecord[]> {
  return db<JobInterviewRecord>(INTERVIEWS)
    .where({ application_id: applicationId })
    .orderBy("created_at", "asc");
}

export async function insertInterview(input: {
  applicationId: number;
  organisationId: number;
  scheduledAt: string | null;
  notes: string | null;
  createdBy: number;
}): Promise<JobInterviewRecord> {
  const [row] = await db<JobInterviewRecord>(INTERVIEWS)
    .insert({
      application_id: input.applicationId,
      organisation_id: input.organisationId,
      scheduled_at: input.scheduledAt,
      notes: input.notes,
      created_by: input.createdBy,
    })
    .returning("*");

  if (!row) {
    throw new Error("The interview row was not returned after insert.");
  }

  return row;
}

export async function updateInterview(
  id: number,
  patch: Partial<{ scheduled_at: string | null; notes: string | null; outcome: string }>,
): Promise<JobInterviewRecord> {
  const [row] = await db<JobInterviewRecord>(INTERVIEWS)
    .where({ id })
    .update({ ...patch, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Interview ${id} disappeared during update.`);
  }

  return row;
}

/* ------------------------------------------------------------------------
   Offers
   --------------------------------------------------------------------- */

export function findOfferById(id: number) {
  return db<JobOfferRecord>(OFFERS).where({ id }).first();
}

export function findOpenOfferForApplication(applicationId: number) {
  return db<JobOfferRecord>(OFFERS)
    .where({ application_id: applicationId, status: "pending" })
    .first();
}

export function listOffersForApplication(applicationId: number): Promise<JobOfferRecord[]> {
  return db<JobOfferRecord>(OFFERS)
    .where({ application_id: applicationId })
    .orderBy("created_at", "desc");
}

export async function insertOffer(input: {
  applicationId: number;
  organisationId: number;
  positionId: number | null;
  title: string | null;
  participationType: string;
  organisationClass: string;
  designation: string;
  expectedStartAt: string | null;
  createdBy: number;
}): Promise<JobOfferRecord> {
  const [row] = await db<JobOfferRecord>(OFFERS)
    .insert({
      application_id: input.applicationId,
      organisation_id: input.organisationId,
      position_id: input.positionId,
      title: input.title,
      participation_type: input.participationType,
      organisation_class: input.organisationClass,
      designation: input.designation,
      expected_start_at: input.expectedStartAt,
      created_by: input.createdBy,
    })
    .returning("*");

  if (!row) {
    throw new Error("The offer row was not returned after insert.");
  }

  return row;
}

export async function transitionOffer(
  id: number,
  status: string,
): Promise<JobOfferRecord> {
  const [row] = await db<JobOfferRecord>(OFFERS)
    .where({ id })
    .update({ status, responded_at: now(), updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Offer ${id} disappeared during transition.`);
  }

  return row;
}
