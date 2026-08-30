import type { Knex } from "knex";

/**
 * Departments are a separate organisational concept from the reporting
 * tree (see positions, migration 009). The tree answers "who reports to
 * whom"; a department answers "who belongs to this group, and which
 * position heads it." Neither table gains a field for the other's job:
 * a position never lists members, and a department is never a node the
 * reporting tree renders.
 *
 * department_members links a department to real people already in the
 * organisation — organisation_members rows (migration 005), the same table
 * the People area already uses. Nothing here invents a person or reuses
 * the rejected "occupant on Position" idea; a department's roster is
 * exactly the organisation's own membership, a subset of it.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("departments", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table.string("name", 150).notNullable();

    // Nullable: a department can exist before a head is assigned. Set null
    // (never cascaded) if that position is later deleted — the department
    // itself is not part of the reporting tree and should not disappear
    // because a position did.
    table
      .integer("head_position_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("positions")
      .onDelete("SET NULL");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["organisation_id"], "departments_organisation_index");
    table.index(["head_position_id"], "departments_head_position_index");
  });

  await knex.schema.createTable("department_members", (table) => {
    table.increments("id").primary();

    table
      .integer("department_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("departments")
      .onDelete("CASCADE");

    table
      .integer("member_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisation_members")
      .onDelete("CASCADE");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(
      ["department_id", "member_id"],
      "department_members_unique",
    );

    table.index(["member_id"], "department_members_member_index");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("department_members");
  await knex.schema.dropTableIfExists("departments");
}
