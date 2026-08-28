/**
 * Username rules and system assignment.
 *
 * Registration never asks for a handle — Yahzel assigns one from the name and
 * email the person already gave — but the handle is a real, unique identity
 * from the first second, and the person can change it later from Profile.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/** Lowercase, starts with a letter, then letters, digits or underscores. */
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,29}$/;

/**
 * Handles Yahzel keeps for itself. Reserving them now costs nothing and
 * avoids having to take a handle away from somebody later.
 */
const RESERVED = new Set([
  "yahzel",
  "admin",
  "administrator",
  "root",
  "support",
  "help",
  "api",
  "www",
  "mail",
  "team",
  "official",
  "staff",
  "security",
  "billing",
  "settings",
  "profile",
  "dashboard",
  "login",
  "logout",
  "register",
  "signup",
  "signin",
  "me",
  "you",
  "null",
  "undefined",
]);

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isReservedUsername(value: string): boolean {
  return RESERVED.has(normalizeUsername(value));
}

/** Strips a free-text string down to the characters a handle may contain. */
function toHandleBase(source: string): string {
  const cleaned = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^[^a-z]+/, "");

  return cleaned.slice(0, 20);
}

/**
 * Ordered handle suggestions for a new account: the email local part first
 * because people recognise it, then the name, then a generic fallback.
 */
export function buildUsernameBases(fullName: string, email: string): string[] {
  const emailLocalPart = email.split("@")[0] ?? "";

  const bases = [
    toHandleBase(emailLocalPart),
    toHandleBase(fullName.replace(/\s+/g, "")),
    "yz",
  ];

  return bases.filter(
    (base, index) =>
      base.length >= USERNAME_MIN_LENGTH && bases.indexOf(base) === index,
  );
}

/**
 * Picks the first free handle. `isTaken` hits the database, and the caller
 * still has to survive the unique constraint — two registrations can race
 * between the check and the insert — but this keeps the common path clean.
 */
export async function allocateUsername(
  fullName: string,
  email: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const bases = buildUsernameBases(fullName, email);

  for (const base of bases) {
    if (!isReservedUsername(base) && !(await isTaken(base))) {
      return base;
    }

    for (let suffix = 1; suffix <= 40; suffix += 1) {
      const candidate = `${base.slice(0, USERNAME_MAX_LENGTH - 4)}${suffix}`;

      if (!(await isTaken(candidate))) {
        return candidate;
      }
    }
  }

  // Nothing derived from the person's own details was free. Fall back to a
  // random handle rather than failing the registration.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `yz${Math.floor(100000 + Math.random() * 900000)}`;

    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  throw new Error("Could not allocate a username.");
}
