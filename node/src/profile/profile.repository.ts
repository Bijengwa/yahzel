import { db } from "../db/knex.js";
import { PROFILES_TABLE, type ProfileRecord } from "../db/profile-record.js";

const TABLE = PROFILES_TABLE;

type Scope = { excludeId?: number };

export function findProfileById(id: number) {
  return db<ProfileRecord>(TABLE).where({ id }).first();
}

export async function usernameExists(
  username: string,
  scope?: Scope,
): Promise<boolean> {
  const query = db<ProfileRecord>(TABLE).where({ username });

  if (scope?.excludeId) {
    query.whereNot({ id: scope.excludeId });
  }

  const row = await query.select("id").first();

  return Boolean(row);
}

/**
 * An address counts as taken if it is somebody's verified email *or* somebody
 * else's pending change — otherwise two people could both be sent a code for
 * the same address and the second one would fail at the finish line.
 */
export async function emailExists(
  email: string,
  scope?: Scope,
): Promise<boolean> {
  const query = db<ProfileRecord>(TABLE).where((builder) =>
    builder.where({ email }).orWhere({ pending_email: email }),
  );

  if (scope?.excludeId) {
    query.whereNot({ id: scope.excludeId });
  }

  const row = await query.select("id").first();

  return Boolean(row);
}

export async function phoneNumberExists(
  phoneNumber: string,
  scope?: Scope,
): Promise<boolean> {
  const query = db<ProfileRecord>(TABLE).where({ phone_number: phoneNumber });

  if (scope?.excludeId) {
    query.whereNot({ id: scope.excludeId });
  }

  const row = await query.select("id").first();

  return Boolean(row);
}

export async function updateProfile(
  id: number,
  patch: Partial<ProfileRecord>,
): Promise<ProfileRecord> {
  const [row] = await db<ProfileRecord>(TABLE)
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() })
    .returning("*");

  if (!row) {
    throw new Error(`Profile ${id} disappeared during update.`);
  }

  return row;
}

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

const CONSTRAINT_FIELDS: Record<string, { field: string; message: string }> = {
  profiles_username_unique: {
    field: "username",
    message: "That username is already taken.",
  },
  profiles_email_unique: {
    field: "email",
    message: "That email address is already in use.",
  },
  profiles_phone_number_unique: {
    field: "phoneNumber",
    message: "That phone number is already in use.",
  },
  profiles_pending_email_unique: {
    field: "email",
    message: "That email address is already in use.",
  },
};

/**
 * Turns a raced unique-constraint failure into the same field error the
 * pre-check would have produced. Anything else is re-thrown untouched so it
 * surfaces as a 500 — a database message must never reach the browser.
 */
export function describeUniqueViolation(
  error: unknown,
): { field: string; message: string } | null {
  const candidate = error as { code?: string; constraint?: string } | null;

  if (!candidate || candidate.code !== UNIQUE_VIOLATION) {
    return null;
  }

  return CONSTRAINT_FIELDS[candidate.constraint ?? ""] ?? {
    field: "form",
    message: "Those details are already in use.",
  };
}
