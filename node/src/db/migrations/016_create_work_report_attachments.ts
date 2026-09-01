import type { Knex } from "knex";

/**
 * Evidence attached to a Work Report — the files that back up what the report
 * claims (a PDF, a screenshot, a scanned document).
 *
 * The database stores only the file's metadata and its storage path, never the
 * bytes, exactly like profiles.profile_picture_url. The bytes live on disk
 * under uploads/work/ (see work.storage.ts), served back as static files; the
 * public path shape mirrors a future CDN URL so the storage module can be
 * swapped without touching this table.
 *
 * work_item_id and organisation_id are denormalised alongside report_id so an
 * attachment can be scoped and cleaned up without joining back through the
 * report. All three cascade: deleting the item (or its org) removes the
 * report and its attachments together.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("work_report_attachments", (table) => {
    table.increments("id").primary();

    table
      .integer("report_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("work_reports")
      .onDelete("CASCADE");

    table
      .integer("work_item_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("work_items")
      .onDelete("CASCADE");

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    table
      .integer("uploaded_by_profile_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    table.string("file_name", 255).notNullable();
    table.string("content_type", 100).notNullable();
    table.integer("byte_size").notNullable();

    // The path the file is served from, e.g. /uploads/work/<uuid>.<ext>. Only
    // ever the path — never the bytes.
    table.string("storage_path", 500).notNullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["report_id"], "work_report_attachments_report_index");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("work_report_attachments");
}
