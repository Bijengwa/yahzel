import type { FieldError, Validated } from "../profile/profile.validation.js";
import { validatePositiveId } from "../hierarchy/hierarchy.validation.js";
import { isProjectStatus, type ProjectStatus } from "./project.record.js";

export type { FieldError, Validated };
export { validatePositiveId };

export const PROJECT_NAME_MIN_LENGTH = 2;
export const PROJECT_NAME_MAX_LENGTH = 200;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 5000;

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

export function validateProjectDescription(
  raw: unknown,
): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "description",
          message: `Keep this under ${PROJECT_DESCRIPTION_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

/**
 * status is optional on create (defaults to "active"); undefined and "" both
 * mean "leave it as active". Anything present must be one of the known states.
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
