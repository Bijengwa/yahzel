import { isSupportedCountry } from "../shared/countries.js";
import {
  validateEmail,
  type FieldError,
  type Validated,
} from "../profile/profile.validation.js";
import {
  isOrganisationType,
  isSystemRole,
  type OrganisationType,
  type SystemRole,
} from "./organisation.types.js";

export type { FieldError, Validated };
export { validateEmail };

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 150;
export const DESCRIPTION_MAX_LENGTH = 500;
export const TITLE_MAX_LENGTH = 120;

export function validateOrganisationName(raw: unknown): Validated<string> {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");

  const fail = (message: string): Validated<string> => ({
    ok: false,
    errors: [{ field: "name", message }],
  });

  if (value.length < NAME_MIN_LENGTH) {
    return fail("Enter the organisation's name.");
  }

  if (value.length > NAME_MAX_LENGTH) {
    return fail(`Names cannot be longer than ${NAME_MAX_LENGTH} characters.`);
  }

  return { ok: true, value };
}

export function validateOrganisationType(
  raw: unknown,
): Validated<OrganisationType> {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!isOrganisationType(value)) {
    return {
      ok: false,
      errors: [{ field: "type", message: "Choose one of the listed types." }],
    };
  }

  return { ok: true, value };
}

export function validateOrganisationCountry(
  raw: unknown,
): Validated<string | null> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  const value = String(raw).trim().toUpperCase();

  if (!isSupportedCountry(value)) {
    return {
      ok: false,
      errors: [{ field: "country", message: "Choose a country from the list." }],
    };
  }

  return { ok: true, value };
}

export function validateDescription(raw: unknown): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "description",
          message: `Keep this under ${DESCRIPTION_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

/**
 * The organisation's own word for the position — "Founder & CEO",
 * "President", "Director General". Yahzel never offers a fixed list here and
 * never rewrites what was typed; it only checks that it is a sane length.
 */
export function validateTitle(
  raw: unknown,
  field = "title",
): Validated<string | null> {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > TITLE_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field,
          message: `Titles cannot be longer than ${TITLE_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

/** Which Yahzel access role an invitation grants. Defaults to plain member. */
export function validateSystemRole(raw: unknown): Validated<SystemRole> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: "member" };
  }

  const value = String(raw).trim().toLowerCase();

  if (!isSystemRole(value)) {
    return {
      ok: false,
      errors: [
        { field: "systemRole", message: "Choose Admin or Member." },
      ],
    };
  }

  return { ok: true, value };
}
