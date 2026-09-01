import type { Knex } from "knex";

/**
 * Phase 3 — the thin employment record and contract foundation.
 *
 * The chain the rest of the system already has is:
 *
 *   profile -> organisation_members (005) -> position_occupancies (012)
 *
 * This migration adds the next two links without touching any of it:
 *
 *   organisation_members -> employment_records -> contracts
 *
 * `employment_records` deliberately does not carry `position_id` or
 * `department_id` — see hierarchy.record.ts's and occupancy.record.ts's own
 * comments, which already forbid an occupant field creeping back onto
 * `positions`. "What position does this person hold" is answered by joining
 * `position_occupancies` on `member_id`, exactly as the UI already does for
 * the org chart; an employment record answers a different question ("is this
 * person currently employed, and since when") and stays out of the
 * reporting tree entirely.
 *
 * Both tables follow the exact idiom `position_occupancies` established:
 * `organisation_id` is carried directly (never only derived through a join),
 * so a row can be validated and queried without one, and can never silently
 * point at a member in one organisation and be read as another's. A row is a
 * historical fact, not a pointer — closing an employment record or a
 * contract sets `end_date`/`status` on the existing row; it is never deleted
 * and never repointed at somebody else. `ends_at IS NULL` is the idiom
 * `position_occupancies` and `organisation_members.left_at` use for "still
 * current"; here the same idea is `end_date IS NULL`.
 *
 * `employment_status` deliberately reuses `organisation_members`'s own
 * status vocabulary — active | inactive | concluded (see
 * organisation.types.ts's MEMBERSHIP_STATUSES) — rather than inventing a
 * second one: a person's employment relationship needs to express exactly
 * the same three states (currently working, currently paused, relationship
 * over) that their membership already does. `contract_type` and `status`
 * are their own small vocabularies (see employment.types.ts).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("employment_records", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table
      .integer("member_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisation_members")
      .onDelete("CASCADE");

    // active | inactive | concluded — see organisation.types.ts's
    // MEMBERSHIP_STATUSES, reused here rather than duplicated.
    table.string("employment_status", 20).notNullable().defaultTo("active");

    table.timestamp("start_date", { useTz: true }).notNullable();

    // Null while this employment relationship is still current — whether
    // presently active or inactive. Set once, when the relationship truly
    // ends; never overwritten by a later re-hire, which gets a new row.
    table.timestamp("end_date", { useTz: true }).nullable();

    table.string("notes", 500).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["organisation_id"], "employment_records_organisation_index");
    table.index(["member_id"], "employment_records_member_index");
  });

  // At most one CURRENT employment record per membership — the same
  // partial-unique idiom position_occupancies_active_member_unique already
  // uses for "at most one active X per member". A concluded relationship
  // (end_date set) frees the membership for a new employment record.
  await knex.raw(`
    CREATE UNIQUE INDEX employment_records_open_member_unique
      ON employment_records (member_id)
      WHERE end_date IS NULL
  `);

  await knex.schema.createTable("contracts", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table
      .integer("employment_record_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("employment_records")
      .onDelete("CASCADE");

    // permanent | fixed_term | probation | consultancy | other — see
    // employment.types.ts.
    table.string("contract_type", 30).notNullable().defaultTo("permanent");

    table.timestamp("start_date", { useTz: true }).notNullable();
    table.timestamp("end_date", { useTz: true }).nullable();

    // active | ended.
    table.string("status", 20).notNullable().defaultTo("active");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["organisation_id"], "contracts_organisation_index");
    table.index(
      ["employment_record_id"],
      "contracts_employment_record_index",
    );
  });

  // At most one active contract per employment record. Since only one row
  // may ever hold status = 'active' at a time, two active contracts can
  // never overlap — the overlap rule the spec asks for falls out of this
  // constraint rather than needing a separate date-range check.
  await knex.raw(`
    CREATE UNIQUE INDEX contracts_active_employment_unique
      ON contracts (employment_record_id)
      WHERE status = 'active'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("contracts");
  await knex.schema.dropTableIfExists("employment_records");
}
