import type { Knex } from "knex";

/**
 * Phase 4 — capabilities/templates + schedules create ordinary Work.
 * History tables are never rewritten. Occurrence identity is unique per
 * schedule so generation is safe to run twice.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("organisation_work_settings", (table) => {
    table.increments("id").primary();
    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .unique()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");
    table.integer("contract_notice_days").notNullable().defaultTo(30);
    table.integer("stalled_inactive_days").notNullable().defaultTo(14);
    table.integer("stalled_blocked_days").notNullable().defaultTo(7);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("work_capabilities", (table) => {
    table.increments("id").primary();
    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");
    table.string("key", 80).notNullable();
    table.string("name", 200).notNullable();
    table.string("description", 2000).nullable();
    table.string("suggested_title", 200).notNullable();
    table.string("suggested_description", 5000).nullable();
    table.string("suggested_expected_output", 5000).nullable();
    table.string("checklist_json", 4000).nullable();
    table.string("default_assignee_rule", 40).notNullable().defaultTo("caller");
    table.string("cadence", 40).nullable();
    table.string("evidence_expectation", 2000).nullable();
    table.boolean("built_in").notNullable().defaultTo(false);
    table.boolean("active").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(["organisation_id", "key"], "work_capabilities_org_key_unique");
    table.index(["organisation_id"], "work_capabilities_org_index");
  });

  await knex.schema.createTable("work_schedules", (table) => {
    table.increments("id").primary();
    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");
    table
      .integer("capability_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("work_capabilities")
      .onDelete("CASCADE");
    table.string("cadence", 40).notNullable();
    table.date("next_run_on").notNullable();
    table.date("last_generated_on").nullable();
    table.integer("assignee_profile_id").unsigned().nullable();
    table.boolean("active").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["organisation_id", "active"], "work_schedules_org_active_index");
  });

  await knex.schema.createTable("work_schedule_occurrences", (table) => {
    table.increments("id").primary();
    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");
    table
      .integer("schedule_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("work_schedules")
      .onDelete("CASCADE");
    table.string("occurrence_key", 40).notNullable();
    table
      .integer("work_item_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("work_items")
      .onDelete("CASCADE");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(["schedule_id", "occurrence_key"], "work_schedule_occurrences_unique");
  });

  await knex.schema.createTable("contract_expiry_notices", (table) => {
    table.increments("id").primary();
    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");
    table
      .integer("contract_id")
      .unsigned()
      .notNullable()
      .unique()
      .references("id")
      .inTable("contracts")
      .onDelete("CASCADE");
    table
      .integer("work_item_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("work_items")
      .onDelete("SET NULL");
    table.timestamp("notified_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("work_stall_notices", (table) => {
    table.increments("id").primary();
    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");
    table
      .integer("work_item_id")
      .unsigned()
      .notNullable()
      .unique()
      .references("id")
      .inTable("work_items")
      .onDelete("CASCADE");
    table.string("kind", 40).notNullable();
    table.timestamp("notified_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable("work_items", (table) => {
    table
      .integer("source_capability_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("work_capabilities")
      .onDelete("SET NULL");
    table
      .integer("source_schedule_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("work_schedules")
      .onDelete("SET NULL");
    table.string("occurrence_key", 40).nullable();
    table
      .integer("contract_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("contracts")
      .onDelete("SET NULL");
    table
      .integer("employment_record_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("employment_records")
      .onDelete("SET NULL");
    table.string("blocked_reason", 40).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("work_items", (table) => {
    table.dropColumn("source_capability_id");
    table.dropColumn("source_schedule_id");
    table.dropColumn("occurrence_key");
    table.dropColumn("contract_id");
    table.dropColumn("employment_record_id");
    table.dropColumn("blocked_reason");
  });
  await knex.schema.dropTableIfExists("work_stall_notices");
  await knex.schema.dropTableIfExists("contract_expiry_notices");
  await knex.schema.dropTableIfExists("work_schedule_occurrences");
  await knex.schema.dropTableIfExists("work_schedules");
  await knex.schema.dropTableIfExists("work_capabilities");
  await knex.schema.dropTableIfExists("organisation_work_settings");
}
