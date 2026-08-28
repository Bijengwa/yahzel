import type { Knex } from "knex";

/**
 * Part 2 — Personal profile.
 *
 * The `profiles` table created in 001 already *is* the person's identity
 * record, so this migration extends it rather than introducing a second,
 * competing user table. Everything added here hangs off the same row the
 * authentication flow already reads.
 *
 * `username` arrives in three steps because the table has live rows: add it
 * nullable, backfill a system-assigned handle for every existing person, then
 * lock it down as NOT NULL UNIQUE.
 */

const RESERVED_FALLBACK = "user";

function slugifyHandle(source: string): string {
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 20);

  return slug.length >= 3 ? slug : "";
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("profiles", (table) => {
    // Identity
    table.string("username", 30).nullable();

    table.string("gender", 20).nullable();

    // ISO 3166-1 alpha-2. Stored as a code, never a display name, so the
    // dial code and the label can both be derived from one stable value.
    table.string("country", 2).nullable();

    // Relative path to a file on the API's own disk (see uploads/). The image
    // bytes never live in this table.
    table.string("profile_picture_url", 255).nullable();

    // Contact
    table.string("phone_number", 20).nullable();

    table.boolean("phone_verified").notNullable().defaultTo(false);

    table.string("phone_verification_otp", 6).nullable();

    table
      .timestamp("phone_verification_otp_expires_at", { useTz: true })
      .nullable();

    // A requested-but-not-yet-trusted email. `email` stays the verified
    // identity until the code sent to `pending_email` is confirmed.
    table.string("pending_email", 255).nullable();

    table.string("pending_email_otp", 6).nullable();

    table
      .timestamp("pending_email_otp_expires_at", { useTz: true })
      .nullable();
  });

  // Backfill a handle for every row that predates this column.
  const existing = await knex("profiles")
    .select("id", "email", "full_name")
    .orderBy("id");

  const taken = new Set<string>();

  for (const row of existing) {
    const emailLocalPart = String(row.email ?? "").split("@")[0] ?? "";

    const base =
      slugifyHandle(emailLocalPart) ||
      slugifyHandle(String(row.full_name ?? "")) ||
      `${RESERVED_FALLBACK}${row.id}`;

    let candidate = base;
    let suffix = 1;

    while (taken.has(candidate)) {
      candidate = `${base.slice(0, 24)}${suffix}`;
      suffix += 1;
    }

    taken.add(candidate);

    await knex("profiles").where({ id: row.id }).update({ username: candidate });
  }

  await knex.schema.alterTable("profiles", (table) => {
    table.string("username", 30).notNullable().alter();
  });

  // Database-level uniqueness. Phone and pending email are nullable, and
  // Postgres treats NULLs as distinct, so many people may have none.
  await knex.schema.alterTable("profiles", (table) => {
    table.unique(["username"], { indexName: "profiles_username_unique" });
    table.unique(["phone_number"], { indexName: "profiles_phone_number_unique" });
    table.unique(["pending_email"], {
      indexName: "profiles_pending_email_unique",
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("profiles", (table) => {
    table.dropUnique(["username"], "profiles_username_unique");
    table.dropUnique(["phone_number"], "profiles_phone_number_unique");
    table.dropUnique(["pending_email"], "profiles_pending_email_unique");
  });

  await knex.schema.alterTable("profiles", (table) => {
    table.dropColumn("username");
    table.dropColumn("gender");
    table.dropColumn("country");
    table.dropColumn("profile_picture_url");
    table.dropColumn("phone_number");
    table.dropColumn("phone_verified");
    table.dropColumn("phone_verification_otp");
    table.dropColumn("phone_verification_otp_expires_at");
    table.dropColumn("pending_email");
    table.dropColumn("pending_email_otp");
    table.dropColumn("pending_email_otp_expires_at");
  });
}
