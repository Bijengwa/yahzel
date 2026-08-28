import { findCountry, isSupportedCountry } from "../shared/countries.js";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  isReservedUsername,
  normalizeUsername,
} from "../shared/username.js";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Stored as a small, stable set of codes. Yahzel will use this later to word
 * references to a person correctly; for V1 the only job is to record the
 * choice faithfully.
 */
export const GENDER_OPTIONS = [
  "male",
  "female",
  "non_binary",
  "prefer_not_to_say",
] as const;

export type Gender = (typeof GENDER_OPTIONS)[number];

/** E.164: a plus, a country code, then up to fourteen more digits. */
export const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

export const FULL_NAME_MIN_LENGTH = 2;
export const FULL_NAME_MAX_LENGTH = 150;

/** A message pinned to the input that caused it, so the UI can point at it. */
export type FieldError = { field: string; message: string };

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldError[] };

export function validateFullName(raw: unknown): Validated<string> {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");

  if (value.length < FULL_NAME_MIN_LENGTH) {
    return {
      ok: false,
      errors: [{ field: "fullName", message: "Enter your full name." }],
    };
  }

  if (value.length > FULL_NAME_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "fullName",
          message: `Full name cannot be longer than ${FULL_NAME_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  if (!/^[\p{L}\p{M}][\p{L}\p{M}'\-. ]*$/u.test(value)) {
    return {
      ok: false,
      errors: [
        {
          field: "fullName",
          message: "Use letters, spaces, apostrophes and hyphens only.",
        },
      ],
    };
  }

  return { ok: true, value };
}

export function validateUsername(raw: unknown): Validated<string> {
  const value = normalizeUsername(String(raw ?? ""));

  const fail = (message: string): Validated<string> => ({
    ok: false,
    errors: [{ field: "username", message }],
  });

  if (!value) {
    return fail("Choose a username.");
  }

  if (value.length < USERNAME_MIN_LENGTH) {
    return fail(`Usernames are at least ${USERNAME_MIN_LENGTH} characters.`);
  }

  if (value.length > USERNAME_MAX_LENGTH) {
    return fail(`Usernames are at most ${USERNAME_MAX_LENGTH} characters.`);
  }

  if (!USERNAME_PATTERN.test(value)) {
    return fail(
      "Start with a letter, then use lowercase letters, numbers or underscores.",
    );
  }

  if (isReservedUsername(value)) {
    return fail("That username is reserved.");
  }

  return { ok: true, value };
}

export function validateGender(raw: unknown): Validated<Gender | null> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  const value = String(raw).trim().toLowerCase();

  if (!(GENDER_OPTIONS as readonly string[]).includes(value)) {
    return {
      ok: false,
      errors: [{ field: "gender", message: "Choose one of the listed options." }],
    };
  }

  return { ok: true, value: value as Gender };
}

export function validateCountry(raw: unknown): Validated<string | null> {
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

export function validateEmail(raw: unknown, field = "email"): Validated<string> {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!EMAIL_PATTERN.test(value)) {
    return {
      ok: false,
      errors: [{ field, message: "Enter a valid email address." }],
    };
  }

  return { ok: true, value };
}

/**
 * Phone numbers are stored in E.164 and must agree with the country on the
 * profile — that is what makes the country field load-bearing rather than
 * decorative.
 */
export function validatePhoneNumber(
  raw: unknown,
  countryCode: string | null,
): Validated<string | null> {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: true, value: null };
  }

  const value = String(raw).replace(/[\s()\-.]/g, "");

  const fail = (message: string): Validated<string | null> => ({
    ok: false,
    errors: [{ field: "phoneNumber", message }],
  });

  if (!value.startsWith("+")) {
    return fail("Include the country code, for example +255 712 345 678.");
  }

  if (!PHONE_PATTERN.test(value)) {
    return fail("Enter a valid phone number.");
  }

  const country = findCountry(countryCode);

  if (country && !value.startsWith(country.dialCode)) {
    return fail(
      `Numbers in ${country.name} start with ${country.dialCode}. Change your country first if this number belongs elsewhere.`,
    );
  }

  return { ok: true, value };
}

export function validatePassword(
  raw: unknown,
  field: string,
): Validated<string> {
  const value = String(raw ?? "");

  if (value.length < 8) {
    return {
      ok: false,
      errors: [
        { field, message: "Passwords must be at least 8 characters." },
      ],
    };
  }

  return { ok: true, value };
}
