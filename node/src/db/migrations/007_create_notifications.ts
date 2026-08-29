import type { Knex } from "knex";

/**
 * A single notification model, reusable by any Yahzel module — Organisation
 * today, Work later. It never duplicates the row it is about: an
 * organisation or invitation is only ever referenced by id, and the message
 * itself is a plain rendered sentence rather than a template the frontend
 * has to reassemble.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("notifications", (table) => {
    table.increments("id").primary();

    table
      .integer("recipient_profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");

    // A dotted event name, e.g. "organisation.invited". Namespaced so a
    // future module's events never collide with Organisation's.
    table.string("type", 60).notNullable();

    table.text("message").notNullable();

    table
      .integer("organisation_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table
      .integer("invitation_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("organisation_invitations")
      .onDelete("CASCADE");

    // Where opening the notification should take the person.
    table.string("action_url", 255).nullable();

    // Null while unread. Read is a moment, not a boolean, so the row also
    // says when.
    table.timestamp("read_at", { useTz: true }).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(
      ["recipient_profile_id", "created_at"],
      "notifications_recipient_created_index",
    );

    table.index(
      ["recipient_profile_id", "read_at"],
      "notifications_recipient_unread_index",
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notifications");
}
