import type { FieldError, Validated } from "../profile/profile.validation.js";
import { validatePositiveId } from "../hierarchy/hierarchy.validation.js";
import {
  isContractStatus,
  isContractType,
  isEmploymentStatus,
  type ContractStatus,
  type ContractType,
  type EmploymentStatus,
} from "./employment.types.js";

export type { FieldError, Validated };
export { validatePositiveId };

export const NOTES_MAX_LENGTH = 500;

export function validateEmploymentStatus(raw: unknown): Validated<EmploymentStatus> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: "active" };
  }

  const value = String(raw).trim().toLowerCase();

  if (!isEmploymentStatus(value)) {
    return {
      ok: false,
      errors: [
        {
          field: "employmentStatus",
          message: "Choose Active, Inactive or Concluded.",
        },
      ],
    };
  }

  return { ok: true, value };
}

export function validateContractType(raw: unknown): Validated<ContractType> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: "permanent" };
  }

  const value = String(raw).trim().toLowerCase();

  if (!isContractType(value)) {
    return {
      ok: false,
      errors: [
        { field: "contractType", message: "Choose one of the listed contract types." },
      ],
    };
  }

  return { ok: true, value };
}

export function validateContractStatus(raw: unknown): Validated<ContractStatus> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: "active" };
  }

  const value = String(raw).trim().toLowerCase();

  if (!isContractStatus(value)) {
    return {
      ok: false,
      errors: [{ field: "status", message: "Choose Active or Ended." }],
    };
  }

  return { ok: true, value };
}

/** A required date — employment/contract start_date. */
export function validateRequiredDate(
  raw: unknown,
  field: string,
): Validated<string> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return {
      ok: false,
      errors: [{ field, message: "Enter a date." }],
    };
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

/** An optional date — end_date on either table. null/undefined/"" clear it. */
export function validateOptionalDate(
  raw: unknown,
  field: string,
): Validated<string | null> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  return validateRequiredDate(raw, field);
}

export function validateOptionalNotes(raw: unknown): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  if (value.length > NOTES_MAX_LENGTH) {
    return {
      ok: false,
      errors: [
        {
          field: "notes",
          message: `Keep this under ${NOTES_MAX_LENGTH} characters.`,
        },
      ],
    };
  }

  return { ok: true, value };
}

/** An end date, if given, may never precede its start date. */
export function checkDateOrder(
  field: string,
  startDate: string,
  endDate: string | null,
): FieldError[] {
  if (endDate !== null && new Date(endDate).getTime() < new Date(startDate).getTime()) {
    return [{ field, message: "The end date cannot be before the start date." }];
  }

  return [];
}
