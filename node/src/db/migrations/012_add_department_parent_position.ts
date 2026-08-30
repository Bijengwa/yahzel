import type { Knex } from "knex";

/**
 * Departments become real nodes in the hierarchy tree (see hierarchy.service.ts's
 * getHierarchy / web/lib/hierarchy.ts's buildHierarchyTree), so a department needs
 * a place to attach to — the position it sits under, exactly like a position's own
 * `parent_position_id` in migration 009.
 *
 * `ON DELETE SET NULL`, not CASCADE: a department is a distinct organisational
 * unit from the reporting tree it currently attaches to. Deleting the position
 * above it should never delete the department itself — it becomes a root
 * department, re-parentable by an admin, same reasoning as head_position_id's
 * existing SET NULL policy in migration 011.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("departments", (table) => {
    table
      .integer("parent_position_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("positions")
      .onDelete("SET NULL");

    table.index(["parent_position_id"], "departments_parent_position_index");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("departments", (table) => {
    table.dropIndex(["parent_position_id"], "departments_parent_position_index");
    table.dropColumn("parent_position_id");
  });
}
