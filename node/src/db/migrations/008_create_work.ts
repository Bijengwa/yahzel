import type { Knex } from "knex";

/**
 * W0 — the minimum usable Work engine.
 *
 * Two tables, and deliberately no more:
 *
 *   work_items       — a standalone unit of work. It does not belong to a
 *                       project, tender or contract yet — those are later
 *                       phases, and a Work Item must work without any of
 *                       them.
 *   work_assignments — who a Work Item is given to. This is never a column
 *                       on work_items: an assignment is its own row so a
 *                       reassignment is a new row, not an overwrite. Only one
 *                       assignment may be "active" for a Work Item at a time,
 *                       enforced by the partial unique index below; every
 *                       earlier assignment is kept, marked "reassigned", and
 *                       is never deleted.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("work_items", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table.string("title", 200).notNullable();
    table.text("description").nullable();
    table.text("expected_output").nullable();

    // not_started | in_progress | blocked | waiting_review | done.
    // Validated in work.validation.ts.
    table.string("status", 20).notNullable().defaultTo("not_started");

    table.integer("progress").notNullable().defaultTo(0);

    table.timestamp("due_at", { useTz: true }).nullable();

    table
      .integer("created_by")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["organisation_id"], "work_items_organisation_index");
    table.index(["created_by"], "work_items_created_by_index");
  });

  await knex.schema.createTable("work_assignments", (table) => {
    table.increments("id").primary();

    table
      .integer("work_item_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("work_items")
      .onDelete("CASCADE");

    table
      .integer("assigned_by")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table
      .integer("assignee_profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table.text("instructions").nullable();

    // active | completed | cancelled | reassigned.
    table.string("status", 20).notNullable().defaultTo("active");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["work_item_id"], "work_assignments_work_item_index");
    table.index(["assignee_profile_id"], "work_assignments_assignee_index");
    table.index(["assigned_by"], "work_assignments_assigned_by_index");
  });

  // Only one assignment may be active per Work Item. This is a partial
  // index, so completed/cancelled/reassigned rows never count toward it —
  // the same technique organisation_invitations already uses (migration 005)
  // to keep only *open* invitations unique.
  await knex.raw(`
    CREATE UNIQUE INDEX work_assignments_active_unique
      ON work_assignments (work_item_id)
      WHERE status = 'active'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("work_assignments");
  await knex.schema.dropTableIfExists("work_items");
}
