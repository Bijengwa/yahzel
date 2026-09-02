import type { FieldError, Validated } from "../profile/profile.validation.js";
import { validatePositiveId } from "../hierarchy/hierarchy.validation.js";
import { validateOptionalPositiveId } from "../work/work.validation.js";
import {
  isProjectOutcomeStatus,
  isProjectStatus,
  type ProjectOutcomeStatus,
  type ProjectStatus,
} from "./project.record.js";

export type { FieldError, Validated };
export { validatePositiveId, validateOptionalPositiveId };

export const PROJECT_NAME_MIN_LENGTH = 2;
export const PROJECT_NAME_MAX_LENGTH = 200;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 5000;
export const OUTCOME_TITLE_MIN_LENGTH = 2;
export const OUTCOME_TITLE_MAX_LENGTH = 200;
export const OUTCOME_DESCRIPTION_MAX_LENGTH = 5000;

export function validateProjectName(raw: unknown): Validated<string> {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (value.length < PROJECT_NAME_MIN_LENGTH) {
    return {
      ok: false,
      errors: [{ field: "name", message: "Enter a name for this project." }],
    };
  }

  if (value.length > PROJECT_NAME_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "name",
          message: `Names cannot be longer than ${PROJECT_NAME_MAX_LENGTH} characters.`,
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

export function validateProjectDescription(
  raw: unknown,
): Validated<string | null> {
  return validateLongText(raw, "description", PROJECT_DESCRIPTION_MAX_LENGTH);
}

/**
 * status is optional on create (defaults to "planned"); undefined and "" both
 * mean "use the default". Anything present must be one of the known states.
 */
export function validateProjectStatus(raw: unknown): Validated<ProjectStatus> {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!isProjectStatus(value)) {
    return {
      ok: false,
      errors: [
        { field: "status", message: "Choose one of the listed statuses." },
      ],
    };
  }

  return { ok: true, value };
}

/** start_date / target_end_date — optional, cleared by null/undefined/"". */
export function validateProjectDate(
  raw: unknown,
  field: string,
): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      errors: [{ field, message: "Enter a valid date." }],
    };
  }

  return { ok: true, value: date.toISOString() };
}

export function validateOutcomeTitle(raw: unknown): Validated<string> {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (value.length < OUTCOME_TITLE_MIN_LENGTH) {
    return {
      ok: false,
      errors: [{ field: "title", message: "Enter a title for this outcome." }],
    };
  }

  if (value.length > OUTCOME_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "title",
          message: `Titles cannot be longer than ${OUTCOME_TITLE_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

export function validateOutcomeDescription(
  raw: unknown,
): Validated<string | null> {
  return validateLongText(raw, "description", OUTCOME_DESCRIPTION_MAX_LENGTH);
}

export function validateOutcomeStatus(
  raw: unknown,
): Validated<ProjectOutcomeStatus> {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!isProjectOutcomeStatus(value)) {
    return {
      ok: false,
      errors: [
        { field: "status", message: "Choose one of the listed statuses." },
      ],
    };
  }

  return { ok: true, value };
}
