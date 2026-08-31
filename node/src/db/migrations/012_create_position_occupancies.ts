import type { Knex } from "knex";

/**
 * The missing relationship between a position (migration 009) and a real
 * person: who occupies it, and for how long. Deliberately its own table,
 * never a field on `positions` — see that migration's own comment, which
 * already forbids adding an occupant/person_id there.
 *
 * A row is a historical fact, not a pointer: assigning somebody inserts a
 * row; ending an occupancy sets `ends_at` on the existing row rather than
 * deleting it. `ends_at IS NULL` is "still current" — the same idiom
 * `organisation_members.left_at` and `work_assignments`'s status history
 * already use elsewhere in this schema.
 *
 * `member_id` references `organisation_members.id` — not `profiles.id` —
 * matching `department_members.member_id` (migration 011) exactly, because
 * occupancy is a fact about a *membership* (it must end when the membership
 * ends), not a raw person. A profile with memberships in several
 * organisations gets a separate `organisation_members` row per
 * organisation, so this table naturally supports "one active position per
 * person per organisation" without needing to know about other
 * organisations at all.
 *
 * `organisation_id` is carried directly rather than only derived through
 * `position_id` or `member_id`, so every row can be validated and queried
 * without a join — and so a row can never silently point at a position in
 * one organisation and a member in another (that check is enforced in
 * occupancy.service.ts, the same way hierarchy.service.ts already checks a
 * parent position belongs to the same organisation before accepting it).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("position_occupancies", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table
      .integer("position_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("positions")
      .onDelete("CASCADE");

    table
      .integer("member_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisation_members")
      .onDelete("CASCADE");

    table.timestamp("starts_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Null while the occupancy is current. Never overwritten with a new
    // person's row — a replacement is a new row of its own.
    table.timestamp("ends_at", { useTz: true }).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["organisation_id"], "position_occupancies_organisation_index");
    table.index(["position_id"], "position_occupancies_position_index");
    table.index(["member_id"], "position_occupancies_member_index");
  });

  // Core rule 1: a position may have only one active occupant. Enforced in
  // the database, not only in the service layer, so a race between two
  // concurrent assignments can never leave a position with two current
  // occupants.
  await knex.raw(`
    CREATE UNIQUE INDEX position_occupancies_active_position_unique
      ON position_occupancies (position_id)
      WHERE ends_at IS NULL
  `);

  // Core rule 2 (V1): a person may occupy only one position at a time
  // within the same organisation. member_id already identifies one
  // membership in one organisation (organisation_members is per-organisation
  // per migration 005), so this alone is sufficient — no need to repeat
  // organisation_id in the index.
  await knex.raw(`
    CREATE UNIQUE INDEX position_occupancies_active_member_unique
      ON position_occupancies (member_id)
      WHERE ends_at IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("position_occupancies");
}
