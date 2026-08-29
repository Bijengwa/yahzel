import type { Knex } from "knex";

/**
 * Part 3 — Organisations (Version 1).
 *
 * Two tables, and deliberately no more: an organisation, and the people who
 * belong to it. The membership row carries three separate ideas that Yahzel
 * must never collapse into one another:
 *
 *   system_role  — what the person may do inside Yahzel (admin | member).
 *   designation  — where they sit in the organisation's structure. "head" is
 *                  the universal highest-ranking designation; everything else
 *                  is a plain member for now. Directors, managers, HR and
 *                  finance become further values of this column later, which
 *                  is why it is a string and not a boolean.
 *   title        — what the organisation itself calls the person: "Founder &
 *                  CEO", "President", "Director General". Free text on
 *                  purpose. Yahzel does not own this vocabulary.
 *
 * There is no "owner". The person who registers the organisation is an admin
 * whose designation is head.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("organisations", (table) => {
    table.increments("id").primary();

    table.string("name", 150).notNullable();

    // company | ngo | government | agency | institution | other.
    // Validated in organisation.types.ts, which the web client also reads
    // through /api/reference/organisation-types.
    table.string("type", 30).notNullable();

    // ISO 3166-1 alpha-2, same convention as profiles.country.
    table.string("country", 2).nullable();

    table.string("description", 500).nullable();

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
  });

  await knex.schema.createTable("organisation_members", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    // Null while an invitation is waiting for somebody who has no Yahzel
    // account yet — the address in `email` is all we have until they join.
    table
      .integer("profile_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");

    // The address the invitation was sent to. Kept after acceptance so an
    // invitation can always be traced back to what was typed.
    table.string("email", 255).nullable();

    table.string("system_role", 20).notNullable().defaultTo("member");

    table.string("designation", 30).notNullable().defaultTo("member");

    table.string("title", 120).nullable();

    // invited | active
    table.string("status", 20).notNullable().defaultTo("invited");

    table
      .integer("invited_by")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("profiles")
      .onDelete("SET NULL");

    table.timestamp("joined_at", { useTz: true }).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // A person belongs to an organisation once, and an address may only be
  // invited to it once. Postgres treats NULLs as distinct, so a pending
  // invitation (profile_id NULL) and a claimed one never collide.
  await knex.schema.alterTable("organisation_members", (table) => {
    table.unique(["organisation_id", "profile_id"], {
      indexName: "organisation_members_org_profile_unique",
    });

    table.unique(["organisation_id", "email"], {
      indexName: "organisation_members_org_email_unique",
    });

    table.index(["profile_id"], "organisation_members_profile_index");
    table.index(["email"], "organisation_members_email_index");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("organisation_members");
  await knex.schema.dropTableIfExists("organisations");
}
