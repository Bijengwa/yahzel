import type { FieldError, Validated } from "../profile/profile.validation.js";
import {
  isAssigneeRule,
  isBlockedReason,
  isCadence,
  type AssigneeRule,
  type BlockedReason,
  type Cadence,
} from "./obligation.types.js";

export type { FieldError, Validated };

export const CAPABILITY_NAME_MIN_LENGTH = 2;
export const CAPABILITY_NAME_MAX_LENGTH = 200;
export const CAPABILITY_DESCRIPTION_MAX_LENGTH = 2000;
export const CAPABILITY_LONG_TEXT_MAX_LENGTH = 5000;
export const CAPABILITY_KEY_MAX_LENGTH = 80;
export const SETTINGS_MIN_DAYS = 1;
export const SETTINGS_MAX_DAYS = 365;

export function validateCapabilityName(raw: unknown): Validated<string> {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");

  if (value.length < CAPABILITY_NAME_MIN_LENGTH) {
    return {
      ok: false,
      errors: [{ field: "name", message: "Enter a name for this capability." }],
    };
  }

  if (value.length > CAPABILITY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "name",
          message: `Keep this under ${CAPABILITY_NAME_MAX_LENGTH} characters.`,
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

export function validateCapabilityDescription(
  raw: unknown,
): Validated<string | null> {
  return validateLongText(raw, "description", CAPABILITY_DESCRIPTION_MAX_LENGTH);
}

export function validateSuggestedTitle(raw: unknown): Validated<string> {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");

  if (!value) {
    return {
      ok: false,
      errors: [
        { field: "suggestedTitle", message: "Enter the title Work created from this will use." },
      ],
    };
  }

  if (value.length > CAPABILITY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "suggestedTitle",
          message: `Keep this under ${CAPABILITY_NAME_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

export function validateSuggestedDescription(raw: unknown): Validated<string | null> {
  return validateLongText(
    raw,
    "suggestedDescription",
    CAPABILITY_LONG_TEXT_MAX_LENGTH,
  );
}

export function validateSuggestedExpectedOutput(
  raw: unknown,
): Validated<string | null> {
  return validateLongText(
    raw,
    "suggestedExpectedOutput",
    CAPABILITY_LONG_TEXT_MAX_LENGTH,
  );
}

export function validateEvidenceExpectation(raw: unknown): Validated<string | null> {
  return validateLongText(
    raw,
    "evidenceExpectation",
    CAPABILITY_DESCRIPTION_MAX_LENGTH,
  );
}

/** A short checklist, one item per line, stored as a JSON string array. */
export function validateChecklist(raw: unknown): Validated<string | null> {
  if (raw === null || raw === undefined) {
    return { ok: true, value: null };
  }

  if (!Array.isArray(raw)) {
    return {
      ok: false,
      errors: [{ field: "checklist", message: "Send the checklist as a list of items." }],
    };
  }

  const items = raw
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0)
    .slice(0, 40);

  if (items.length === 0) {
    return { ok: true, value: null };
  }

  return { ok: true, value: JSON.stringify(items) };
}

export function validateAssigneeRule(raw: unknown): Validated<AssigneeRule> {
  const value = String(raw ?? "caller").trim().toLowerCase();

  if (!isAssigneeRule(value)) {
    return {
      ok: false,
      errors: [
        {
          field: "defaultAssigneeRule",
          message: "Choose who this capability assigns Work to by default.",
        },
      ],
    };
  }

  return { ok: true, value };
}

export function validateOptionalCadence(raw: unknown): Validated<Cadence | null> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  const value = String(raw).trim().toLowerCase();

  if (!isCadence(value)) {
    return {
      ok: false,
      errors: [{ field: "cadence", message: "Choose one of the listed cadences." }],
    };
  }

  return { ok: true, value };
}

export function validateBlockedReason(raw: unknown): Validated<BlockedReason> {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!isBlockedReason(value)) {
    return {
      ok: false,
      errors: [
        { field: "blockedReason", message: "Choose one of the listed blocked reasons." },
      ],
    };
  }

  return { ok: true, value };
}

/** A day threshold — the settings panel's three fields. */
export function validateDayThreshold(raw: unknown, field: string): Validated<number> {
  const value = Number(raw);

  if (!Number.isInteger(value) || value < SETTINGS_MIN_DAYS || value > SETTINGS_MAX_DAYS) {
    return {
      ok: false,
      errors: [
        {
          field,
          message: `Enter a whole number of days between ${SETTINGS_MIN_DAYS} and ${SETTINGS_MAX_DAYS}.`,
        },
      ],
    };
  }

  return { ok: true, value };
}
