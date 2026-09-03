import { isPortfolioVisibility, type PortfolioVisibility } from "./profile.cv.record.js";
import type { FieldError, Validated } from "./profile.validation.js";

export const SKILL_NAME_MAX_LENGTH = 80;
export const HEADLINE_MAX_LENGTH = 160;
export const SUMMARY_MAX_LENGTH = 3000;
export const INSTITUTION_MAX_LENGTH = 160;
export const CERTIFICATION_NAME_MAX_LENGTH = 160;
export const CREDENTIAL_URL_MAX_LENGTH = 500;
export const MAX_FEATURED_WORK_ITEMS = 12;

export function validateSkillName(raw: unknown): Validated<string> {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");

  if (!value) {
    return { ok: false, errors: [{ field: "name", message: "Enter a skill." }] };
  }

  if (value.length > SKILL_NAME_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "name",
          message: `Skills cannot be longer than ${SKILL_NAME_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

export function validateHeadline(raw: unknown): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > HEADLINE_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "headline",
          message: `Keep this under ${HEADLINE_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

export function validateSummary(raw: unknown): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > SUMMARY_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "summary",
          message: `Keep this under ${SUMMARY_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

function validateShortText(
  raw: unknown,
  field: string,
  maxLength: number,
  required: boolean,
  requiredMessage: string,
): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    if (required) {
      return { ok: false, errors: [{ field, message: requiredMessage }] };
    }

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

export function validateInstitution(raw: unknown): Validated<string> {
  const result = validateShortText(
    raw,
    "institution",
    INSTITUTION_MAX_LENGTH,
    true,
    "Enter the institution's name.",
  );

  return result.ok
    ? { ok: true, value: result.value as string }
    : (result as Validated<string>);
}

export function validateOptionalShortText(
  raw: unknown,
  field: string,
  maxLength: number,
): Validated<string | null> {
  return validateShortText(raw, field, maxLength, false, "");
}

export function validateCertificationName(raw: unknown): Validated<string> {
  const result = validateShortText(
    raw,
    "name",
    CERTIFICATION_NAME_MAX_LENGTH,
    true,
    "Enter the certification's name.",
  );

  return result.ok
    ? { ok: true, value: result.value as string }
    : (result as Validated<string>);
}

export function validateCredentialUrl(raw: unknown): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > CREDENTIAL_URL_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "credentialUrl",
          message: `Keep this under ${CREDENTIAL_URL_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    return {
      ok: false,
      errors: [{ field: "credentialUrl", message: "Enter a valid URL." }],
    };
  }

  return { ok: true, value };
}

export function validateOptionalDate(
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

  return { ok: true, value: date.toISOString().slice(0, 10) };
}

export function validateDateOrder(
  startField: string,
  start: string | null,
  end: string | null,
): FieldError[] {
  if (!start || !end) {
    return [];
  }

  if (new Date(end).getTime() < new Date(start).getTime()) {
    return [{ field: startField, message: "This cannot be after the end date." }];
  }

  return [];
}

export function validatePortfolioVisibility(
  raw: unknown,
): Validated<PortfolioVisibility> {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!isPortfolioVisibility(value)) {
    return {
      ok: false,
      errors: [{ field: "visibility", message: "Choose one of the listed options." }],
    };
  }

  return { ok: true, value };
}

export function validateFeaturedWorkIds(raw: unknown): Validated<number[]> {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      errors: [{ field: "workItemIds", message: "That is not a valid list." }],
    };
  }

  if (raw.length > MAX_FEATURED_WORK_ITEMS) {
    return {
      ok: false,
      errors: [
        {
          field: "workItemIds",
          message: `Feature at most ${MAX_FEATURED_WORK_ITEMS} items.`,
        },
      ],
    };
  }

  const ids: number[] = [];

  for (const entry of raw) {
    const id = Number(entry);

    if (!Number.isInteger(id) || id <= 0) {
      return {
        ok: false,
        errors: [{ field: "workItemIds", message: "That is not a valid list." }],
      };
    }

    if (!ids.includes(id)) {
      ids.push(id);
    }
  }

  return { ok: true, value: ids };
}
