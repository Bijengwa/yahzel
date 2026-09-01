import type { Knex } from "knex";

/**
 * A Work Report is what the assignee submits as the record of work done, for
 * the creator (or an admin) to accept or return.
 *
 * History is never destroyed. Returning a report does not delete or reopen it:
 * the returned row is kept forever with its decision and reason, and the
 * assignee submits a NEW report row for the next attempt. A Work Item can
 * therefore accumulate many reports — one accepted, several returned before it.
 *
 * States: draft | submitted | accepted | returned.
 *   draft     — being written by the author, not yet seen by a reviewer.
 *   submitted — sent for review; the Work Item sits at "waiting_review".
 *   accepted  — a terminal decision; the Work Item becomes "done".
 *   returned  — a terminal decision with a reason; the Work Item goes back to
 *               "in_progress" and the author may start a new report.
 *
 * At most one NON-TERMINAL report (draft or submitted) may exist per Work
 * Item at a time — you cannot have two open drafts, or submit while a draft is
 * pending. This is enforced in the database by the partial unique index below,
 * the same technique work_assignments (migration 008) uses for its single
 * active assignment.
 *
 * organisation_id is carried directly for isolation, matching work_items — a
 * report can be validated and scoped without joining back through the item.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("work_reports", (table) => {
    table.increments("id").primary();

    table
      .integer("work_item_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("work_items")
      .onDelete("CASCADE");

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table
      .integer("author_profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table.text("body").notNullable();

    // draft | submitted | accepted | returned. Validated in work.validation.ts.
    table.string("state", 20).notNullable().defaultTo("draft");

    // Why a report was returned. Null until (and unless) it is returned.
    table.text("decision_reason").nullable();

    table
      .integer("reviewed_by_profile_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table.timestamp("submitted_at", { useTz: true }).nullable();
    table.timestamp("reviewed_at", { useTz: true }).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["work_item_id"], "work_reports_work_item_index");
  });

  // Only one open (draft or submitted) report per Work Item. A partial index
  // so accepted/returned rows never count toward it — the same idiom the
  // single-active-assignment index uses in migration 008.
  await knex.raw(`
    CREATE UNIQUE INDEX work_reports_open_unique
      ON work_reports (work_item_id)
      WHERE state IN ('draft', 'submitted')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("work_reports");
}
