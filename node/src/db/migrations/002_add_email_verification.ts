import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("profiles", (table) => {
    table
      .boolean("email_verified")
      .notNullable()
      .defaultTo(false);

    table.string("verification_otp", 6).nullable();

    table
      .timestamp("verification_otp_expires_at", { useTz: true })
      .nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("profiles", (table) => {
    table.dropColumn("email_verified");
    table.dropColumn("verification_otp");
    table.dropColumn("verification_otp_expires_at");
  });
}