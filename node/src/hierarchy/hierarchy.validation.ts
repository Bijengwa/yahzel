import type { FieldError, Validated } from "../profile/profile.validation.js";

export type { FieldError, Validated };

export const POSITION_NAME_MIN_LENGTH = 2;
export const POSITION_NAME_MAX_LENGTH = 150;

export function validatePositionName(raw: unknown): Validated<string> {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");

  if (value.length < POSITION_NAME_MIN_LENGTH) {
    return {
      ok: false,
      errors: [{ field: "name", message: "Enter a name for this position." }],
    };
  }

  if (value.length > POSITION_NAME_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "name",
          message: `Names cannot be longer than ${POSITION_NAME_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

/** organisationId and positionId — both untrusted body/param values. */
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
