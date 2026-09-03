/**
 * The four tables migration 023 added, mirroring work.record.ts's shape for
 * its own pipeline (Work Item -> Report -> Attachment).
 */

export const JOB_POSTINGS_TABLE = "job_postings";
export const JOB_APPLICATIONS_TABLE = "job_applications";
export const JOB_INTERVIEWS_TABLE = "job_interviews";
export const JOB_OFFERS_TABLE = "job_offers";

export const JOB_POSTING_STATUSES = ["draft", "open", "closed"] as const;
export type JobPostingStatus = (typeof JOB_POSTING_STATUSES)[number];

export function isJobPostingStatus(value: string): value is JobPostingStatus {
  return (JOB_POSTING_STATUSES as readonly string[]).includes(value);
}

export const JOB_APPLICATION_STATUSES = [
  "submitted",
  "under_review",
  "interviewing",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
] as const;
export type JobApplicationStatus = (typeof JOB_APPLICATION_STATUSES)[number];

export function isJobApplicationStatus(value: string): value is JobApplicationStatus {
  return (JOB_APPLICATION_STATUSES as readonly string[]).includes(value);
}

/** Terminal — an application here never changes again. */
export const JOB_APPLICATION_TERMINAL_STATUSES = ["hired", "rejected", "withdrawn"] as const;

export const JOB_INTERVIEW_OUTCOMES = ["pending", "passed", "failed"] as const;
export type JobInterviewOutcome = (typeof JOB_INTERVIEW_OUTCOMES)[number];

export function isJobInterviewOutcome(value: string): value is JobInterviewOutcome {
  return (JOB_INTERVIEW_OUTCOMES as readonly string[]).includes(value);
}

export const JOB_OFFER_STATUSES = ["pending", "accepted", "declined", "withdrawn"] as const;
export type JobOfferStatus = (typeof JOB_OFFER_STATUSES)[number];

export function isJobOfferStatus(value: string): value is JobOfferStatus {
  return (JOB_OFFER_STATUSES as readonly string[]).includes(value);
}

export type JobPostingRecord = {
  id: number;
  organisation_id: number;
  title: string;
  description: string | null;
  department_id: number | null;
  position_id: number | null;
  participation_type: string;
  status: string;
  created_by: number;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobApplicationRecord = {
  id: number;
  job_posting_id: number;
  organisation_id: number;
  applicant_profile_id: number;
  cover_note: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type JobInterviewRecord = {
  id: number;
  application_id: number;
  organisation_id: number;
  scheduled_at: string | null;
  notes: string | null;
  outcome: string;
  created_by: number;
  created_at: string;
  updated_at: string;
};

export type JobOfferRecord = {
  id: number;
  application_id: number;
  organisation_id: number;
  position_id: number | null;
  title: string | null;
  participation_type: string;
  organisation_class: string;
  designation: string;
  expected_start_at: string | null;
  status: string;
  created_by: number;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};
