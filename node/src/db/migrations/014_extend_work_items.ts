import type { Knex } from "knex";

/**
 * Phase 2 grows a Work Item without changing what it already was.
 *
 * New optional relationships, every one nullable so an existing Work Item —
 * standalone, no project, no parent, no department — stays valid:
 *
 *   project_id    — the project this belongs to, if any (migration 013).
 *                   ON DELETE SET NULL: deleting a project orphans its Work,
 *                   it never deletes the Work.
 *   parent_id     — a self-reference for ONE level of child work. A child
 *                   points at its parent; a parent's parent_id is null. The
 *                   "a child may not itself be a parent" rule (max depth 1)
 *                   is enforced in work.service.ts, not the schema.
 *                   ON DELETE SET NULL: removing a parent frees its children,
 *                   it does not cascade-delete them.
 *   department_id — a SCOPE only, never the accountable owner. The owner is
 *                   always the active assignment's assignee. ON DELETE SET
 *                   NULL so retiring a department leaves its Work intact.
 *
 * Three activity timestamps let a list surface "what moved recently" without
 * scanning assignments/reports:
 *
 *   last_activity_at — bumped on every change (edit, reassign, report). Not
 *                      nullable: backfilled to updated_at for existing rows so
 *                      the column is meaningful from day one.
 *   last_progress_at — set only when progress actually changed. Nullable: a
 *                      Work Item that never moved has no progress moment.
 *   last_report_at   — set on report activity. Nullable for the same reason.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("work_items", (table) => {
    table
      .integer("project_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("projects")
      .onDelete("SET NULL");

    table
      .integer("parent_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("work_items")
      .onDelete("SET NULL");

    table
      .integer("department_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("departments")
      .onDelete("SET NULL");

    table
      .timestamp("last_activity_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.timestamp("last_progress_at", { useTz: true }).nullable();
    table.timestamp("last_report_at", { useTz: true }).nullable();

    table.index(["project_id"], "work_items_project_index");
    table.index(["parent_id"], "work_items_parent_index");
    table.index(["department_id"], "work_items_department_index");
  });

  // Give existing rows a truthful activity moment rather than "now": the last
  // time the row itself was touched is the closest fact we have.
  await knex("work_items").update({
    last_activity_at: knex.ref("updated_at"),
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("work_items", (table) => {
    table.dropIndex(["project_id"], "work_items_project_index");
    table.dropIndex(["parent_id"], "work_items_parent_index");
    table.dropIndex(["department_id"], "work_items_department_index");

    table.dropColumn("project_id");
    table.dropColumn("parent_id");
    table.dropColumn("department_id");
    table.dropColumn("last_activity_at");
    table.dropColumn("last_progress_at");
    table.dropColumn("last_report_at");
  });
}
