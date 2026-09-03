import type { Knex } from "knex";

/**
 * V1 completion — Hiring.
 *
 * The pipeline Yahzel was missing entirely: Job Posting -> Application ->
 * Review -> Interview -> Offer -> Accept. What already existed (see
 * migration 018) was strictly post-hire — employment_records/contracts — and
 * a separate invite/accept flow (migration 005) that creates
 * organisation_members directly. This migration does not touch either: an
 * accepted offer calls the *same* insertMembership the invite flow uses
 * (see hiring.service.ts), so there is still exactly one place a membership
 * is created, not two competing ones.
 *
 *   job_postings    — what an organisation is hiring for. draft is never
 *                     visible to applicants; open is; closed no longer
 *                     accepts applications but is kept, never deleted.
 *   job_applications — one row per (posting, applicant). status moves
 *                     forward through review and interviewing; withdrawn and
 *                     rejected are terminal, same idea as Work Reports'
 *                     returned state — kept, not erased.
 *   job_interviews  — a stage record on an application. An application can
 *                     have several, one per round.
 *   job_offers      — at most one *open* (pending) offer per application at
 *                     a time, mirroring work_reports_open_unique.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("job_postings", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table.string("title", 200).notNullable();
    table.text("description").nullable();

    table
      .integer("department_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("departments")
      .onDelete("SET NULL");

    // The position this posting is hiring for, if the org already models
    // one. Never required — many organisations post before the position
    // formally exists in their hierarchy.
    table
      .integer("position_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("positions")
      .onDelete("SET NULL");

    // Mirrors organisation_members.participation_type's vocabulary.
    table.string("participation_type", 30).notNullable().defaultTo("employee");

    // draft | open | closed.
    table.string("status", 20).notNullable().defaultTo("draft");

    table
      .integer("created_by")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table.timestamp("opened_at", { useTz: true }).nullable();
    table.timestamp("closed_at", { useTz: true }).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["organisation_id", "status"], "job_postings_org_status_index");
  });

  await knex.schema.createTable("job_applications", (table) => {
    table.increments("id").primary();

    table
      .integer("job_posting_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("job_postings")
      .onDelete("CASCADE");

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table
      .integer("applicant_profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");

    table.text("cover_note").nullable();

    // submitted | under_review | interviewing | offered | hired | rejected | withdrawn.
    table.string("status", 20).notNullable().defaultTo("submitted");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.unique(["job_posting_id", "applicant_profile_id"], {
      indexName: "job_applications_posting_applicant_unique",
    });
    table.index(["organisation_id"], "job_applications_org_index");
    table.index(["applicant_profile_id"], "job_applications_applicant_index");
  });

  await knex.schema.createTable("job_interviews", (table) => {
    table.increments("id").primary();

    table
      .integer("application_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("job_applications")
      .onDelete("CASCADE");

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table.timestamp("scheduled_at", { useTz: true }).nullable();
    table.text("notes").nullable();

    // pending | passed | failed.
    table.string("outcome", 20).notNullable().defaultTo("pending");

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

    table.index(["application_id"], "job_interviews_application_index");
  });

  await knex.schema.createTable("job_offers", (table) => {
    table.increments("id").primary();

    table
      .integer("application_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("job_applications")
      .onDelete("CASCADE");

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
      .nullable()
      .references("id")
      .inTable("positions")
      .onDelete("SET NULL");

    table.string("title", 120).nullable();
    table.string("participation_type", 30).notNullable().defaultTo("employee");
    table.string("organisation_class", 30).notNullable().defaultTo("member");
    table.string("designation", 30).notNullable().defaultTo("member");

    table.timestamp("expected_start_at", { useTz: true }).nullable();

    // pending | accepted | declined | withdrawn.
    table.string("status", 20).notNullable().defaultTo("pending");

    table
      .integer("created_by")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table.timestamp("responded_at", { useTz: true }).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["application_id"], "job_offers_application_index");
  });

  // At most one open (pending) offer per application at a time — same shape
  // as work_reports_open_unique.
  await knex.raw(`
    CREATE UNIQUE INDEX job_offers_open_application_unique
      ON job_offers (application_id)
      WHERE status = 'pending'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("job_offers");
  await knex.schema.dropTableIfExists("job_interviews");
  await knex.schema.dropTableIfExists("job_applications");
  await knex.schema.dropTableIfExists("job_postings");
}
