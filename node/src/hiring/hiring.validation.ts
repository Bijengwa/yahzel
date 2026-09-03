import type { FieldError, Validated } from "../profile/profile.validation.js";
import {
  validateDescription,
  validateDesignation,
  validateOrganisationClass,
  validateParticipationType,
  validateTitle,
} from "../organisation/organisation.validation.js";
import {
  isJobInterviewOutcome,
  isJobPostingStatus,
  type JobInterviewOutcome,
  type JobPostingStatus,
} from "./hiring.record.js";

export type { FieldError, Validated };
// Reused as-is — a job posting's participation type, and an offer's
// participation type/organisation class/designation, are the exact same
// vocabulary organisation_members already uses; a hire simply proposes the
// membership it will become.
export { validateDescription, validateDesignation, validateOrganisationClass, validateParticipationType, validateTitle };

export const POSTING_TITLE_MIN_LENGTH = 2;
export const POSTING_TITLE_MAX_LENGTH = 200;
export const COVER_NOTE_MAX_LENGTH = 4000;
export const INTERVIEW_NOTES_MAX_LENGTH = 4000;

export function validatePostingTitle(raw: unknown): Validated<string> {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");

  if (value.length < POSTING_TITLE_MIN_LENGTH) {
    return {
      ok: false,
      errors: [{ field: "title", message: "Enter a title for this job posting." }],
    };
  }

  if (value.length > POSTING_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "title",
          message: `Titles cannot be longer than ${POSTING_TITLE_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

export function validatePostingStatus(raw: unknown): Validated<JobPostingStatus> {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!isJobPostingStatus(value)) {
    return {
      ok: false,
      errors: [{ field: "status", message: "Choose one of the listed statuses." }],
    };
  }

  return { ok: true, value };
}

export function validateCoverNote(raw: unknown): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > COVER_NOTE_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        { field: "coverNote", message: `Keep this under ${COVER_NOTE_MAX_LENGTH} characters.` },
      ],
    };
  }

  return { ok: true, value };
}

export function validateInterviewNotes(raw: unknown): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > INTERVIEW_NOTES_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        { field: "notes", message: `Keep this under ${INTERVIEW_NOTES_MAX_LENGTH} characters.` },
      ],
    };
  }

  return { ok: true, value };
}

export function validateInterviewOutcome(raw: unknown): Validated<JobInterviewOutcome> {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!isJobInterviewOutcome(value)) {
    return {
      ok: false,
      errors: [{ field: "outcome", message: "Choose one of the listed outcomes." }],
    };
  }

  return { ok: true, value };
}

export function validateOptionalDateTime(
  raw: unknown,
  field: string,
): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { ok: false, errors: [{ field, message: "Enter a valid date." }] };
  }

  return { ok: true, value: date.toISOString() };
}

export function validatePositiveId(raw: unknown, field: string): Validated<number> {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return { ok: false, errors: [{ field, message: "That value is not valid." }] };
  }

  return { ok: true, value };
}

export function validateOptionalPositiveId(
  raw: unknown,
  field: string,
): Validated<number | null> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  return validatePositiveId(raw, field);
}

export const REJECT_REASON_MAX_LENGTH = 1000;

export function validateOptionalReason(raw: unknown, field: string): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > REJECT_REASON_MAX_LENGTH) {
    return {
      ok: false,
      errors: [{ field, message: `Keep this under ${REJECT_REASON_MAX_LENGTH} characters.` }],
    };
  }

  return { ok: true, value };
}
