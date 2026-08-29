import { isSupportedCountry } from "../shared/countries.js";
import {
  validateEmail,
  type FieldError,
  type Validated,
} from "../profile/profile.validation.js";
import {
  ADMINISTRATION_DESIGNATIONS,
  isDesignation,
  isMembershipStatus,
  isOrganisationClass,
  isOrganisationType,
  isParticipationType,
  isSystemRole,
  type Designation,
  type MembershipStatus,
  type OrganisationClass,
  type OrganisationType,
  type ParticipationType,
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
 * "President", "Director General", "Accountant", "Community Volunteer".
 * Yahzel never offers a fixed list here and never rewrites what was typed; it
 * only checks that it is a sane length.
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
      errors: [{ field: "systemRole", message: "Choose Admin or Member." }],
    };
  }

  return { ok: true, value };
}

/** Employment, internship, volunteering — all one membership, typed. */
export function validateParticipationType(
  raw: unknown,
): Validated<ParticipationType> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: "employee" };
  }

  const value = String(raw).trim().toLowerCase();

  if (!isParticipationType(value)) {
    return {
      ok: false,
      errors: [
        {
          field: "participationType",
          message: "Choose one of the listed participation types.",
        },
      ],
    };
  }

  return { ok: true, value };
}

/** Administration or Member — the organisation's leadership class. */
export function validateOrganisationClass(
  raw: unknown,
): Validated<OrganisationClass> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: "member" };
  }

  const value = String(raw).trim().toLowerCase();

  if (!isOrganisationClass(value)) {
    return {
      ok: false,
      errors: [
        {
          field: "organisationClass",
          message: "Choose Administration or Member.",
        },
      ],
    };
  }

  return { ok: true, value };
}

export function validateDesignation(raw: unknown): Validated<Designation> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: "member" };
  }

  const value = String(raw).trim().toLowerCase();

  if (!isDesignation(value)) {
    return {
      ok: false,
      errors: [
        { field: "designation", message: "Choose one of the listed positions." },
      ],
    };
  }

  return { ok: true, value };
}

/**
 * The planned end date, known up front. Optional for most participation, but
 * `checkExpectedEndDate` requires it for an internship.
 */
export function validateExpectedEndDate(raw: unknown): Validated<string | null> {
  const value = String(raw ?? "").trim();

  if (!value) {
    return { ok: true, value: null };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      errors: [{ field: "expectedEndAt", message: "Enter a valid date." }],
    };
  }

  return { ok: true, value: date.toISOString() };
}

/**
 * An internship is time-bound by definition — Yahzel refuses to open one
 * without an end date rather than silently leaving it open-ended.
 */
export function checkExpectedEndDate(
  participationType: string,
  expectedEndAt: string | null,
): FieldError[] {
  if (participationType === "intern" && !expectedEndAt) {
    return [
      {
        field: "expectedEndAt",
        message: "An internship needs an end date.",
      },
    ];
  }

  return [];
}

export function validateMembershipStatus(
  raw: unknown,
): Validated<MembershipStatus> {
  const value = String(raw ?? "").trim().toLowerCase();

  if (!isMembershipStatus(value)) {
    return {
      ok: false,
      errors: [
        { field: "status", message: "Choose Active, Inactive or Concluded." },
      ],
    };
  }

  return { ok: true, value };
}

/**
 * Head, Director and Manager are Administration positions. Yahzel refuses the
 * combination rather than quietly moving somebody's class for them — the
 * organisation should say what it means.
 */
export function checkClassAndDesignation(
  organisationClass: string,
  designation: string,
): FieldError[] {
  if (
    organisationClass !== "administration" &&
    ADMINISTRATION_DESIGNATIONS.includes(designation)
  ) {
    return [
      {
        field: "designation",
        message:
          "Head, Director and Manager belong to the Administration class.",
      },
    ];
  }

  return [];
}

/**
 * Who an invitation is for: a Yahzel username, or an email address. One of
 * the two is required, and a value containing "@" is read as an address.
 */
export type InviteeIdentifier =
  | { kind: "email"; value: string }
  | { kind: "username"; value: string };

export function validateInvitee(raw: unknown): Validated<InviteeIdentifier> {
  const value = String(raw ?? "").trim();

  const fail = (message: string): Validated<InviteeIdentifier> => ({
    ok: false,
    errors: [{ field: "person", message }],
  });

  if (!value) {
    return fail("Enter a Yahzel username or an email address.");
  }

  if (value.includes("@") && !value.startsWith("@")) {
    const email = validateEmail(value);

    return email.ok
      ? { ok: true, value: { kind: "email", value: email.value } }
      : fail("Enter a valid email address.");
  }

  const username = value.replace(/^@/, "").toLowerCase();

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return fail("Enter a Yahzel username or an email address.");
  }

  return { ok: true, value: { kind: "username", value: username } };
}
