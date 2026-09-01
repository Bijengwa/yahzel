import type { FieldError, Validated } from "../profile/profile.validation.js";
import { isWorkStatus, type WorkStatus } from "./work.record.js";

export type { FieldError, Validated };

export const TITLE_MIN_LENGTH = 2;
export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 5000;
export const EXPECTED_OUTPUT_MAX_LENGTH = 5000;
export const INSTRUCTIONS_MAX_LENGTH = 2000;
export const REPORT_BODY_MIN_LENGTH = 1;
export const REPORT_BODY_MAX_LENGTH = 10000;
export const DECISION_REASON_MIN_LENGTH = 1;
export const DECISION_REASON_MAX_LENGTH = 2000;

export function validateWorkTitle(raw: unknown): Validated<string> {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");

  if (value.length < TITLE_MIN_LENGTH) {
    return {
      ok: false,
      errors: [{ field: "title", message: "Enter a title for this work." }],
    };
  }

  if (value.length > TITLE_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "title",
          message: `Titles cannot be longer than ${TITLE_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

function validateLongText(
  raw: unknown,
  field: string,
  maxLength: number,
): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > maxLength) {
    return {
      ok: false,
      errors: [{ field, message: `Keep this under ${maxLength} characters.` }],
    };
  }

  return { ok: true, value };
}

export function validateWorkDescription(raw: unknown): Validated<string | null> {
  return validateLongText(raw, "description", DESCRIPTION_MAX_LENGTH);
}

export function validateExpectedOutput(raw: unknown): Validated<string | null> {
  return validateLongText(raw, "expectedOutput", EXPECTED_OUTPUT_MAX_LENGTH);
}

export function validateInstructions(raw: unknown): Validated<string | null> {
  return validateLongText(raw, "instructions", INSTRUCTIONS_MAX_LENGTH);
}

export function validateDueAt(raw: unknown): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      errors: [{ field: "dueAt", message: "Enter a valid date." }],
    };
  }

  return { ok: true, value: date.toISOString() };
}

export function validateWorkStatus(raw: unknown): Validated<WorkStatus> {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!isWorkStatus(value)) {
    return {
      ok: false,
      errors: [{ field: "status", message: "Choose one of the listed statuses." }],
    };
  }

  return { ok: true, value };
}

export function validateProgress(raw: unknown): Validated<number> {
  const value = Number(raw);

  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return {
      ok: false,
      errors: [
        {
          field: "progress",
          message: "Progress must be a whole number from 0 to 100.",
        },
      ],
    };
  }

  return { ok: true, value };
}

/** organisationId and assigneeProfileId — both untrusted body values. */
export function validatePositiveId(
  raw: unknown,
  field: string,
): Validated<number> {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return {
      ok: false,
      errors: [{ field, message: "That value is not valid." }],
    };
  }

  return { ok: true, value };
}

/**
 * projectId / parentId / departmentId on create — every one optional and
 * clearable: null, undefined and "" all mean "no link". Anything else must be
 * a positive id, checked against the organisation by the service.
 */
export function validateOptionalPositiveId(
  raw: unknown,
  field: string,
): Validated<number | null> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  return validatePositiveId(raw, field);
}

/** The text body of a report — required, non-empty, capped. */
export function validateReportBody(raw: unknown): Validated<string> {
  const value = String(raw ?? "").trim();

  if (value.length < REPORT_BODY_MIN_LENGTH) {
    return {
      ok: false,
      errors: [{ field: "body", message: "Write the report before saving it." }],
    };
  }

  if (value.length > REPORT_BODY_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "body",
          message: `Keep this under ${REPORT_BODY_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

/** The reason a report is returned — required, non-empty, capped. */
export function validateDecisionReason(raw: unknown): Validated<string> {
  const value = String(raw ?? "").trim();

  if (value.length < DECISION_REASON_MIN_LENGTH) {
    return {
      ok: false,
      errors: [
        { field: "reason", message: "Say why this report is being returned." },
      ],
    };
  }

  if (value.length > DECISION_REASON_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "reason",
          message: `Keep this under ${DECISION_REASON_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}
