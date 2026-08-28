import { db } from "../db/knex.js";

export type ProfileRecord = {
  id: number;
  full_name: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  verification_otp: string | null;
  verification_otp_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE = "profiles";

export function findUserByEmail(email: string) {
  return db<ProfileRecord>(TABLE).where({ email }).first();
}

export function findUserById(id: number) {
  return db<ProfileRecord>(TABLE).where({ id }).first();
}

export async function createUser(input: {
  fullName: string;
  email: string;
  passwordHash: string;
}): Promise<
  Pick<
    ProfileRecord,
    "id" | "full_name" | "email" | "email_verified" | "created_at"
  >
> {
  const [user] = await db<ProfileRecord>(TABLE)
    .insert({
      full_name: input.fullName,
      email: input.email,
      password_hash: input.passwordHash,
    })
    .returning([
      "id",
      "full_name",
      "email",
      "email_verified",
      "created_at",
    ]);

  if (!user) {
    throw new Error("Failed to create user.");
  }

  return user;
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