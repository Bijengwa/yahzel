import type { Knex } from "knex";

/**
 * Phase 5 — Projects grow from "a name Work can optionally sit under"
 * (migration 013) into a real coordination layer: an accountable owner,
 * contributors, outcomes, and a traceable timeline. None of this touches how
 * Work itself executes — project_id on work_items (migration 014) is still
 * the only link between the two, and it is still nullable.
 *
 *   owner_profile_id — the accountable person. Every project has exactly
 *                       one; backfilled from created_by (the closest existing
 *                       fact) so no row is ever left without one. RESTRICT:
 *                       an owner's profile cannot vanish out from under a
 *                       project, the same rule created_by already follows.
 *   department_id     — an optional organisational scope, the same idea and
 *                        the same ON DELETE SET NULL work_items.department_id
 *                        already uses. A project is never itself part of the
 *                        reporting tree.
 *   start_date /
 *   target_end_date   — both optional and both just informational; nothing
 *                        enforces work against them.
 *   archived_at       — a visibility flag independent of status. Archiving
 *                        hides a project from the default view; it is never
 *                        a delete and never rewrites status.
 *
 * The status vocabulary grows from active|archived into the five-state
 * lifecycle validated in project.validation.ts (still not a DB enum, per the
 * original migration's own note). Existing "archived" rows are carried
 * forward as archived_at + status "cancelled" — the closest honest reading
 * of what "archived" meant before this table had a real lifecycle — so no
 * row's history is silently discarded.
 *
 * project_members is contributors only, mirroring department_members: a
 * plain join to a real profile, no history kept on the row itself (removing
 * someone is a delete, exactly like leaving a department) because the
 * traceability requirement is met by project_events below, not by the roster
 * row. The owner is deliberately not duplicated into this table — it already
 * has a single source of truth on projects.owner_profile_id.
 *
 * project_outcomes is a goal record, not a second Work engine: it has no
 * assignee, no progress, no reports. Anything an outcome needs done is
 * ordinary Work, linked by project_id like any other.
 *
 * project_events is Yahzel's first table built specifically to answer "what
 * happened here" for one record over time — nothing existing already does
 * this generically (Work's own history lives inside its own tables: kept
 * assignment rows, kept report rows). It follows the same idea notifications
 * already established: a message rendered once into a sentence at write
 * time, never reassembled from a template on read.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("projects", (table) => {
    table
      .integer("owner_profile_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table
      .integer("department_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("departments")
      .onDelete("SET NULL");

    table.timestamp("start_date", { useTz: true }).nullable();
    table.timestamp("target_end_date", { useTz: true }).nullable();
    table.timestamp("archived_at", { useTz: true }).nullable();

    table.index(["owner_profile_id"], "projects_owner_index");
    table.index(["department_id"], "projects_department_index");
  });

  // Backfill first, constrain second: every existing project gets its
  // creator as owner (the closest existing fact), and any row that was
  // "archived" under the old two-state vocabulary keeps that fact as
  // archived_at rather than losing it when "archived" stops being a status.
  await knex("projects").update({ owner_profile_id: knex.ref("created_by") });
  await knex("projects")
    .where({ status: "archived" })
    .update({ archived_at: knex.ref("updated_at"), status: "cancelled" });

  await knex.schema.alterTable("projects", (table) => {
    table.integer("owner_profile_id").unsigned().notNullable().alter();
    table.string("status", 20).notNullable().defaultTo("planned").alter();
  });

  await knex.schema.createTable("project_members", (table) => {
    table.increments("id").primary();

    table
      .integer("project_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("projects")
      .onDelete("CASCADE");

    table
      .integer("profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");

    table
      .integer("added_by")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["project_id", "profile_id"], "project_members_unique");
    table.index(["profile_id"], "project_members_profile_index");
  });

  await knex.schema.createTable("project_outcomes", (table) => {
    table.increments("id").primary();

    table
      .integer("project_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("projects")
      .onDelete("CASCADE");

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table.string("title", 200).notNullable();
    table.text("description").nullable();

    // Nullable: an outcome can exist before anyone is named accountable for
    // it. SET NULL (never cascaded) if that profile is later removed — the
    // outcome itself is not the profile's record.
    table
      .integer("owner_profile_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("profiles")
      .onDelete("SET NULL");

    table.timestamp("target_date", { useTz: true }).nullable();

    // not_started | in_progress | done. Validated in project.validation.ts,
    // not a DB enum — same convention as projects.status.
    table.string("status", 20).notNullable().defaultTo("not_started");

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

    table.index(["project_id"], "project_outcomes_project_index");
  });

  await knex.schema.createTable("project_events", (table) => {
    table.increments("id").primary();

    table
      .integer("project_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("projects")
      .onDelete("CASCADE");

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table
      .integer("actor_profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    // A dotted event name, e.g. "project.owner_changed". See project.record.ts.
    table.string("type", 50).notNullable();
    table.text("message").notNullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["project_id", "created_at"], "project_events_project_index");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("project_events");
  await knex.schema.dropTableIfExists("project_outcomes");
  await knex.schema.dropTableIfExists("project_members");

  await knex.schema.alterTable("projects", (table) => {
    table.string("status", 20).notNullable().defaultTo("active").alter();
  });

  await knex.schema.alterTable("projects", (table) => {
    table.dropIndex(["owner_profile_id"], "projects_owner_index");
    table.dropIndex(["department_id"], "projects_department_index");

    table.dropColumn("owner_profile_id");
    table.dropColumn("department_id");
    table.dropColumn("start_date");
    table.dropColumn("target_end_date");
    table.dropColumn("archived_at");
  });
}
