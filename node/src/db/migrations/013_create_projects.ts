import type { Knex } from "knex";

/**
 * A minimal `projects` table — a Work Item may optionally belong to one.
 *
 * This is deliberately NOT a project-management system: it is a lightweight
 * grouping so several Work Items can share a name and a status. Everything a
 * project would eventually grow (milestones, budgets, membership) is a later
 * phase. A Work Item works perfectly well with no project at all — the
 * `project_id` added to work_items in migration 014 is nullable.
 *
 * Organisation isolation follows the same rule the rest of the schema uses:
 * `organisation_id` is carried directly (cascade delete with the org), and a
 * project id from another organisation is refused in the service layer, read
 * as "not found here", never revealing the project exists.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("projects", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table.string("name", 200).notNullable();
    table.text("description").nullable();

    // active | archived. Validated in project.validation.ts, not a DB enum,
    // so a new state is a code change and not a migration.
    table.string("status", 20).notNullable().defaultTo("active");

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

    table.index(["organisation_id"], "projects_organisation_index");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("projects");
}
