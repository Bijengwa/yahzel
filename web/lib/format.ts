import type { Country } from "./countries";

export const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

export function genderLabel(value: string | null): string | null {
  return GENDER_OPTIONS.find((option) => option.value === value)?.label ?? null;
}

/** Up to two letters for the avatar fallback. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";

  return `${first}${last}`.toUpperCase();
}

/**
 * Splits a stored E.164 number into the dial code and the national part, so
 * changing country can swap the prefix without disturbing what was typed.
 */
export function splitPhoneNumber(
  phoneNumber: string | null,
  countries: Country[],
): { dialCode: string | null; nationalNumber: string } {
  if (!phoneNumber) {
    return { dialCode: null, nationalNumber: "" };
  }

  // Longest dial code first: +1 must not win over +1... style prefixes.
  const match = [...countries]
    .sort((a, b) => b.dialCode.length - a.dialCode.length)
    .find((country) => phoneNumber.startsWith(country.dialCode));

  if (!match) {
    return { dialCode: null, nationalNumber: phoneNumber.replace(/^\+/, "") };
  }

  return {
    dialCode: match.dialCode,
    nationalNumber: phoneNumber.slice(match.dialCode.length),
  };
}

/** Groups the national part into readable blocks: +255 712 345 678. */
export function formatPhoneNumber(
  phoneNumber: string | null,
  countries: Country[],
): string | null {
  if (!phoneNumber) {
    return null;
  }

  const { dialCode, nationalNumber } = splitPhoneNumber(phoneNumber, countries);

  const grouped = nationalNumber.replace(/(\d{3})(?=\d)/g, "$1 ").trim();

  return dialCode ? `${dialCode} ${grouped}` : phoneNumber;
}

export function formatJoinedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** "Sep 2026" — the compact form organisation timelines are written in. */
export function formatMonthYear(iso: string | null): string | null {
  if (!iso) {
    return null;
  }

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

/** "Sep 30" — compact, for due dates in a list or detail view. */
export function formatShortDate(iso: string | null): string | null {
  if (!iso) {
    return null;
  }

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * "Today", "Yesterday", or the short date beyond that — the wording an
 * "Updated" column reads at a glance rather than a full timestamp.
 */
export function formatRelativeDay(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

  const dayDiff = Math.round(
    (startOf(now) - startOf(date)) / (24 * 60 * 60 * 1000),
  );

  if (dayDiff === 0) {
    return "Today";
  }

  if (dayDiff === 1) {
    return "Yesterday";
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
