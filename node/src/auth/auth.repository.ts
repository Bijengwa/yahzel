import { db } from "../db/knex.js";
import { PROFILES_TABLE, type ProfileRecord } from "../db/profile-record.js";

export type { ProfileRecord };

const TABLE = PROFILES_TABLE;


export function findUserByEmail(email: string) {
  return db<ProfileRecord>(TABLE).where({ email }).first();
}

export function findUserById(id: number) {
  return db<ProfileRecord>(TABLE).where({ id }).first();
}

/**
 * Usernames are assigned by Yahzel at registration, never chosen on the form,
 * so this takes one rather than deriving it - see shared/username.ts.
 */
export async function createUser(input: {
  fullName: string;
  email: string;
  username: string;
  passwordHash: string;
}): Promise<
  Pick<
    ProfileRecord,
    "id" | "full_name" | "username" | "email" | "email_verified" | "created_at"
  >
> {
  const [user] = await db<ProfileRecord>(TABLE)
    .insert({
      full_name: input.fullName,
      email: input.email,
      username: input.username,
      password_hash: input.passwordHash,
    })
    .returning([
      "id",
      "full_name",
      "username",
      "email",
      "email_verified",
      "created_at",
    ]);

  if (!user) {
    throw new Error("Failed to create user.");
  }

  return user;
}

export async function usernameExists(username: string): Promise<boolean> {
  const row = await db<ProfileRecord>(TABLE)
    .where({ username })
    .select("id")
    .first();

  return Boolean(row);
}

/** Replaces the stored credential. Hashing happens in the service. */
export async function updatePasswordHash(
  userId: number,
  passwordHash: string,
): Promise<void> {
  await db<ProfileRecord>(TABLE)
    .where({ id: userId })
    .update({ password_hash: passwordHash, updated_at: db.fn.now() });
}

export async function saveVerificationOtp(
  userId: number,
  otp: string,
  expiresAt: Date,
): Promise<void> {
  await db<ProfileRecord>(TABLE)
    .where({ id: userId })
    .update({
      verification_otp: otp,
      verification_otp_expires_at: expiresAt.toISOString(),
      updated_at: db.fn.now(),
    });
}

export async function markEmailAsVerified(userId: number): Promise<void> {
  await db<ProfileRecord>(TABLE)
    .where({ id: userId })
    .update({
      email_verified: true,
      verification_otp: null,
      verification_otp_expires_at: null,
      updated_at: db.fn.now(),
    });
}