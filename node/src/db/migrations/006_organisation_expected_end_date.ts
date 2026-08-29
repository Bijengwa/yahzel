import type { Knex } from "knex";

/**
 * Phase 1 — time-bound participation.
 *
 * A membership already has `joined_at`/`left_at` for when a relationship
 * actually started and ended. This adds `expected_end_at`: the planned end
 * date known at the time the relationship is offered or begins — required
 * for an internship, optional for everything else. It is never treated as a
 * conclusion by itself; only `status`/`left_at` do that.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organisation_members", (table) => {
    table.timestamp("expected_end_at", { useTz: true }).nullable();
  });

  await knex.schema.alterTable("organisation_invitations", (table) => {
    table.timestamp("expected_end_at", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organisation_members", (table) => {
    table.dropColumn("expected_end_at");
  });

  await knex.schema.alterTable("organisation_invitations", (table) => {
    table.dropColumn("expected_end_at");
  });
}
