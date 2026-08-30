import type { Knex } from "knex";

/**
 * The hierarchy foundation: a tree of organisational POSITIONS and their
 * reporting relationships. Deliberately bare — no occupant, no person_id,
 * no employee assignment. Connecting people to positions is a separate
 * future feature; this table only ever answers "what reports to what."
 *
 * `parent_position_id` is nullable: a position with no parent is a root.
 * An organisation may have any number of roots (Head, Secretary General,
 * Assistant Head as three independent roots is a valid structure) — nothing
 * here assumes a single universal shape.
 *
 * The self-referential foreign key cascades on delete: removing a position
 * removes its whole subtree. This is the safe behaviour chosen for this
 * foundation — see hierarchy.service.ts's deleteHierarchyPosition, which
 * reports how many descendants went with it rather than silently orphaning
 * them or leaving dangling parent references.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("positions", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table.string("name", 150).notNullable();

    table
      .integer("parent_position_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("positions")
      .onDelete("CASCADE");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["organisation_id"], "positions_organisation_index");
    table.index(["parent_position_id"], "positions_parent_index");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("positions");
}
