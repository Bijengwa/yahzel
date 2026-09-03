import type { Knex } from "knex";

/**
 * V1 completion — CV & Portfolio.
 *
 * Adds the profile content a verified professional record is built from
 * (skills, education, certifications, a short headline/summary) plus the
 * settings that control what a portfolio shows to whom.
 *
 * Nothing here duplicates work history: the CV is assembled at read time from
 * organisation_members, employment_records, position_occupancies and
 * work_reports, exactly as intelligence.history.service.ts already does for
 * a single organisation. These tables hold only what genuinely has no other
 * home — skills, education, certifications, and the person's own words about
 * themselves and their portfolio.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("profiles", (table) => {
    // A one-line professional title, e.g. "Backend Engineer". Shown at the
    // top of the CV and the portfolio alike.
    table.string("headline", 160).nullable();

    // A short professional summary in the person's own words.
    table.text("summary").nullable();
  });

  await knex.schema.createTable("profile_skills", (table) => {
    table.increments("id").primary();

    table
      .integer("profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");

    table.string("name", 80).notNullable();
    table.integer("position").unsigned().notNullable().defaultTo(0);

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["profile_id", "name"], {
      indexName: "profile_skills_profile_name_unique",
    });
  });

  await knex.schema.createTable("profile_education", (table) => {
    table.increments("id").primary();

    table
      .integer("profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");

    table.string("institution", 160).notNullable();
    table.string("degree", 160).nullable();
    table.string("field_of_study", 160).nullable();

    table.date("start_date").nullable();
    // Null end_date reads as "in progress" — same idea as an active
    // membership's null left_at.
    table.date("end_date").nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["profile_id"], "profile_education_profile_index");
  });

  await knex.schema.createTable("profile_certifications", (table) => {
    table.increments("id").primary();

    table
      .integer("profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");

    table.string("name", 160).notNullable();
    table.string("issuing_organisation", 160).nullable();
    table.date("issued_at").nullable();
    table.date("expires_at").nullable();
    table.string("credential_url", 500).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["profile_id"], "profile_certifications_profile_index");
  });

  // One row per profile. Created lazily on first read with sane defaults
  // rather than at registration, mirroring how organisation_work_settings is
  // fetched-or-defaulted rather than always present from day one.
  await knex.schema.createTable("portfolio_settings", (table) => {
    table.increments("id").primary();

    table
      .integer("profile_id")
      .unsigned()
      .notNullable()
      .unique()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");

    // private — only the owner. organisation — fellow members of any
    // organisation the owner currently belongs to. public — any signed-in
    // Yahzel user (Yahzel has no unauthenticated surface to publish to yet).
    table.string("visibility", 20).notNullable().defaultTo("private");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("portfolio_featured_work", (table) => {
    table.increments("id").primary();

    table
      .integer("profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");

    table
      .integer("work_item_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("work_items")
      .onDelete("CASCADE");

    table.integer("position").unsigned().notNullable().defaultTo(0);

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["profile_id", "work_item_id"], {
      indexName: "portfolio_featured_work_profile_item_unique",
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("portfolio_featured_work");
  await knex.schema.dropTableIfExists("portfolio_settings");
  await knex.schema.dropTableIfExists("profile_certifications");
  await knex.schema.dropTableIfExists("profile_education");
  await knex.schema.dropTableIfExists("profile_skills");

  await knex.schema.alterTable("profiles", (table) => {
    table.dropColumn("headline");
    table.dropColumn("summary");
  });
}
