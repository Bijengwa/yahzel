import type { Knex } from "knex";

/**
 * Phase 6 — the one new table this phase needs. `operational_signals` is a
 * derived-facts cache over existing records (Work, Projects, Outcomes,
 * Contracts): it never becomes a second source of truth for any of them, and
 * every row can be recomputed at any time from the tables it references.
 *
 * `entity_type` + `entity_id` is a loose (non-FK) reference on purpose: the
 * entity a signal points at varies by row (work_items, projects,
 * project_outcomes, contracts), and a single foreign key cannot span four
 * tables. `organisation_id` still carries a real FK so a signal is always
 * deleted with its organisation.
 *
 * Sticky resolution: a signal's identity is (organisation_id, type,
 * entity_type, entity_id) — a real unique index. Re-running the scan updates
 * an *active* row's message/severity in place (never re-notifies, mirroring
 * work_stall_notices) and marks a row *resolved* the moment its condition is
 * no longer detected. A *manually* resolved row is left alone by later scans
 * even if the same condition is still present — see
 * intelligence.signal.service.ts for why.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("operational_signals", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    // Dotted signal name, e.g. "work.overdue". See intelligence.record.ts.
    table.string("type", 40).notNullable();

    // work_item | project | project_outcome | contract. See the note above.
    table.string("entity_type", 30).notNullable();
    table.integer("entity_id").unsigned().notNullable();

    // active | resolved.
    table.string("status", 20).notNullable().defaultTo("active");

    // normal | high. Factual urgency only — never a performance judgement.
    table.string("severity", 20).notNullable().defaultTo("normal");

    // Already a rendered sentence, like project_events.message and
    // notifications.message — never reassembled from a template on read.
    table.text("message").notNullable();

    table
      .timestamp("detected_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.timestamp("resolved_at", { useTz: true }).nullable();

    table
      .integer("resolved_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("profiles")
      .onDelete("SET NULL");

    // manual | condition_cleared. Null while active.
    table.string("resolution", 20).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(
      ["organisation_id", "type", "entity_type", "entity_id"],
      "operational_signals_identity_unique",
    );
    table.index(["organisation_id", "status"], "operational_signals_org_status_index");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("operational_signals");
}
