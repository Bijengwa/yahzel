import type { FieldError, Validated } from "../profile/profile.validation.js";
import { validatePositiveId } from "../hierarchy/hierarchy.validation.js";

export type { FieldError, Validated };
export { validatePositiveId };

export const DEPARTMENT_NAME_MIN_LENGTH = 1;
export const DEPARTMENT_NAME_MAX_LENGTH = 150;

export function validateDepartmentName(raw: unknown): Validated<string> {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");

  if (value.length < DEPARTMENT_NAME_MIN_LENGTH) {
    return {
      ok: false,
      errors: [{ field: "name", message: "Enter a name for this department." }],
    };
  }

  if (value.length > DEPARTMENT_NAME_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "name",
          message: `Names cannot be longer than ${DEPARTMENT_NAME_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

/**
 * A head position is optional and clearable: null, undefined and "" all mean
 * "no head". Anything else must be a positive id, checked against the
 * organisation by the service before it is trusted.
 */
export function validateOptionalHeadPosition(
  raw: unknown,
): Validated<number | null> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  return validatePositiveId(raw, "headPositionId");
}

/** The organisation_members.id of the person being added to a department. */
export function validateMemberId(raw: unknown): Validated<number> {
  return validatePositiveId(raw, "memberId");
}
