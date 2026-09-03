import { apiRequest } from "./api";

/**
 * Job Posting -> Application -> Review -> Interview -> Offer -> Accept ->
 * Organisation Member -> Position -> Work. Mirrors node/src/hiring.
 */

export const POSTING_STATUSES = ["draft", "open", "closed"] as const;
export type PostingStatus = (typeof POSTING_STATUSES)[number];

export const POSTING_STATUS_LABELS: Record<PostingStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

export const APPLICATION_STATUSES = [
  "submitted",
  "under_review",
  "interviewing",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  interviewing: "Interviewing",
  offered: "Offered",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export function applicationStatusLabel(status: string): string {
  return APPLICATION_STATUS_LABELS[status as ApplicationStatus] ?? status;
}

export const OFFER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export function offerStatusLabel(status: string): string {
  return OFFER_STATUS_LABELS[status] ?? status;
}

export type JobPosting = {
  id: number;
  organisationId: number;
  title: string;
  description: string | null;
  departmentId: number | null;
  positionId: number | null;
  participationType: string;
  status: PostingStatus;
  createdBy: number;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobApplication = {
  id: number;
  jobPostingId: number;
  organisationId: number;
  applicantProfileId: number;
  coverNote: string | null;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
};

export type JobInterview = {
  id: number;
  applicationId: number;
  scheduledAt: string | null;
  notes: string | null;
  outcome: "pending" | "passed" | "failed";
  createdBy: number;
  createdAt: string;
  updatedAt: string;
};

export type JobOffer = {
  id: number;
  applicationId: number;
  positionId: number | null;
  title: string | null;
  participationType: string;
  organisationClass: string;
  designation: string;
  expectedStartAt: string | null;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  createdBy: number;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------------
   Job postings
   --------------------------------------------------------------------- */

export function fetchOpenPostings(organisationId: number): Promise<{ postings: JobPosting[] }> {
  return apiRequest(`/api/hiring/${organisationId}/postings`);
}

export function fetchAdminPostings(organisationId: number): Promise<{ postings: JobPosting[] }> {
  return apiRequest(`/api/hiring/${organisationId}/postings?admin=1`);
}

export type CreatePostingInput = {
  title: string;
  description?: string | null;
  departmentId?: number | null;
  positionId?: number | null;
  participationType?: string;
};

export function createJobPosting(
  organisationId: number,
  input: CreatePostingInput,
): Promise<{ message: string; posting: JobPosting }> {
  return apiRequest(`/api/hiring/${organisationId}/postings`, { method: "POST", body: input });
}

export function fetchPosting(
  organisationId: number,
  postingId: number,
): Promise<{ posting: JobPosting }> {
  return apiRequest(`/api/hiring/${organisationId}/postings/${postingId}`);
}

export function updatePostingStatus(
  organisationId: number,
  postingId: number,
  status: PostingStatus,
): Promise<{ message: string; posting: JobPosting }> {
  return apiRequest(`/api/hiring/${organisationId}/postings/${postingId}/status`, {
    method: "POST",
    body: { status },
  });
}

/* ------------------------------------------------------------------------
   Applications
   --------------------------------------------------------------------- */

export function applyToPosting(
  organisationId: number,
  postingId: number,
  coverNote: string,
): Promise<{ message: string; application: JobApplication }> {
  return apiRequest(`/api/hiring/${organisationId}/postings/${postingId}/applications`, {
    method: "POST",
    body: { coverNote },
  });
}

export function fetchPostingApplications(
  organisationId: number,
  postingId: number,
): Promise<{ applications: JobApplication[] }> {
  return apiRequest(`/api/hiring/${organisationId}/postings/${postingId}/applications`);
}

export function fetchOrganisationApplications(
  organisationId: number,
): Promise<{ applications: JobApplication[] }> {
  return apiRequest(`/api/hiring/${organisationId}/applications`);
}

export function fetchMyApplications(): Promise<{ applications: JobApplication[] }> {
  return apiRequest("/api/hiring/applications/mine");
}

export function fetchApplication(
  organisationId: number,
  applicationId: number,
): Promise<{ application: JobApplication; interviews: JobInterview[]; offers: JobOffer[] }> {
  return apiRequest(`/api/hiring/${organisationId}/applications/${applicationId}`);
}

export function reviewApplication(
  organisationId: number,
  applicationId: number,
  status: "under_review" | "rejected",
): Promise<{ message: string; application: JobApplication }> {
  return apiRequest(`/api/hiring/${organisationId}/applications/${applicationId}/review`, {
    method: "POST",
    body: { status },
  });
}

export function withdrawApplication(
  applicationId: number,
): Promise<{ message: string; application: JobApplication }> {
  return apiRequest(`/api/hiring/applications/${applicationId}/withdraw`, { method: "POST" });
}

/* ------------------------------------------------------------------------
   Interviews
   --------------------------------------------------------------------- */

export function scheduleInterview(
  organisationId: number,
  applicationId: number,
  input: { scheduledAt?: string | null; notes?: string | null },
): Promise<{ message: string; interview: JobInterview }> {
  return apiRequest(`/api/hiring/${organisationId}/applications/${applicationId}/interviews`, {
    method: "POST",
    body: input,
  });
}

export function updateInterview(
  organisationId: number,
  interviewId: number,
  input: { scheduledAt?: string | null; notes?: string | null; outcome?: string },
): Promise<{ message: string; interview: JobInterview }> {
  return apiRequest(`/api/hiring/${organisationId}/interviews/${interviewId}`, {
    method: "PATCH",
    body: input,
  });
}

/* ------------------------------------------------------------------------
   Offers
   --------------------------------------------------------------------- */

export type CreateOfferInput = {
  positionId?: number | null;
  title?: string | null;
  participationType?: string;
  organisationClass?: string;
  designation?: string;
  expectedStartAt?: string | null;
};

export function createOffer(
  organisationId: number,
  applicationId: number,
  input: CreateOfferInput,
): Promise<{ message: string; offer: JobOffer }> {
  return apiRequest(`/api/hiring/${organisationId}/applications/${applicationId}/offers`, {
    method: "POST",
    body: input,
  });
}

export function acceptOffer(offerId: number): Promise<{
  message: string;
  offer: JobOffer;
  membership: unknown;
  occupancyAssigned: boolean;
}> {
  return apiRequest(`/api/hiring/offers/${offerId}/accept`, { method: "POST" });
}

export function declineOffer(offerId: number): Promise<{ message: string; offer: JobOffer }> {
  return apiRequest(`/api/hiring/offers/${offerId}/decline`, { method: "POST" });
}

export function withdrawOffer(
  organisationId: number,
  offerId: number,
): Promise<{ message: string; offer: JobOffer }> {
  return apiRequest(`/api/hiring/${organisationId}/offers/${offerId}/withdraw`, {
    method: "POST",
  });
}
