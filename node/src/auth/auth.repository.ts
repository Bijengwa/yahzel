import { db } from "../db/knex.js";

export type UserRecord = {
  id: number;
  full_name: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

const TABLE = "users";

export function findUserByEmail(email: string) {
  return db<UserRecord>(TABLE).where({ email }).first();
}

export async function createUser(input: {
  fullName: string;
  email: string;
  passwordHash: string;
}): Promise<Pick<UserRecord, "id" | "full_name" | "email" | "created_at">> {
  const [user] = await db<UserRecord>(TABLE)
    .insert({
      full_name: input.fullName,
      email: input.email,
      password_hash: input.passwordHash,
    })
    .returning(["id", "full_name", "email", "created_at"]);

  if (!user) {
    throw new Error("Failed to create user.");
  }

  return user;
}
