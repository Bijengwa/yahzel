import type { Knex } from "knex";

/**
 * Lets a notification point at a Work Item, the same way it can already point
 * at an organisation or an invitation (migration 007). Phase 2's work.*
 * notifications (assigned, report submitted/accepted/returned) reference the
 * item this way so the client can deep-link straight to it.
 *
 * Nullable — every existing notification predates Work, and organisation- and
 * invitation-scoped notifications never carry one. ON DELETE SET NULL: a
 * deleted Work Item leaves its notifications readable, just no longer linked.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("notifications", (table) => {
    table
      .integer("work_item_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("work_items")
      .onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("notifications", (table) => {
    table.dropColumn("work_item_id");
  });
}
