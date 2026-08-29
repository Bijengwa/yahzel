import type { Knex } from "knex";

/**
 * Phase 1 — Organisation foundation.
 *
 * Migration 004 modelled a membership and an invitation as the same row, and
 * recognised only "head" or "member". Phase 1 separates the two ideas and
 * gives the membership the vocabulary the organisation actually needs:
 *
 *   participation_type  — employee | intern | volunteer | contractor |
 *                         consultant | member | other. One membership concept
 *                         covers all of them; there is no separate intern or
 *                         volunteer table.
 *   organisation_class  — administration | member. Administration is the
 *                         organisation's leadership class. It is NOT the
 *                         Yahzel `system_role` "admin", which stays a pure
 *                         access role in its own column.
 *   designation         — the position held inside that class: head, manager,
 *                         director, or plain member. "head" belongs to
 *                         Administration and is never assigned automatically.
 *   title               — the organisation's own word for the person.
 *   status              — active | inactive | concluded. Memberships are
 *                         never deleted; a relationship that ends is
 *                         concluded and keeps its timeline.
 *   joined_at/left_at   — the timeline. A null left_at on an active
 *                         membership reads as "Present".
 *
 * Invitations move to their own table so an unanswered invitation is no
 * longer a half-formed membership, and so declining or cancelling one leaves
 * a record instead of a hole.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("organisation_members", (table) => {
    table
      .string("participation_type", 30)
      .notNullable()
      .defaultTo("employee");

    table.string("organisation_class", 30).notNullable().defaultTo("member");

    table.timestamp("left_at", { useTz: true }).nullable();
  });

  // 004 made the creator the head automatically. Phase 1 does not: the
  // creator is an admin, and Head is a decision the organisation makes
  // separately. Existing heads keep their position but are moved into the
  // Administration class, where the position belongs.
  await knex("organisation_members")
    .where({ designation: "head" })
    .update({ organisation_class: "administration" });

  /* ----------------------------------------------------------------------
     Invitations
     ------------------------------------------------------------------- */

  await knex.schema.createTable("organisation_invitations", (table) => {
    table.increments("id").primary();

    table
      .integer("organisation_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("organisations")
      .onDelete("CASCADE");

    // Null while the invitation waits for somebody who has no Yahzel account
    // yet. Registration fills it in — see linkInvitationsToProfile.
    table
      .integer("profile_id")
      .unsigned()
      .nullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");

    table.string("email", 255).notNullable();

    table
      .integer("invited_by")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("RESTRICT");

    // What the organisation is proposing. Copied onto the membership on
    // acceptance, so the person joins as exactly what they were offered.
    table.string("system_role", 20).notNullable().defaultTo("member");
    table.string("participation_type", 30).notNullable().defaultTo("employee");
    table.string("organisation_class", 30).notNullable().defaultTo("member");
    table.string("designation", 30).notNullable().defaultTo("member");
    table.string("title", 120).nullable();

    // pending | accepted | declined | cancelled | expired
    table.string("status", 20).notNullable().defaultTo("pending");

    table.timestamp("expires_at", { useTz: true }).nullable();
    table.timestamp("responded_at", { useTz: true }).nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table.index(["profile_id"], "organisation_invitations_profile_index");
    table.index(["email"], "organisation_invitations_email_index");
    table.index(
      ["organisation_id"],
      "organisation_invitations_organisation_index",
    );
  });

  // Only *open* invitations are unique. A declined invitation must not block
  // the organisation from asking again, which a plain unique key would.
  await knex.raw(`
    CREATE UNIQUE INDEX organisation_invitations_open_email_unique
      ON organisation_invitations (organisation_id, lower(email))
      WHERE status = 'pending'
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX organisation_invitations_open_profile_unique
      ON organisation_invitations (organisation_id, profile_id)
      WHERE status = 'pending' AND profile_id IS NOT NULL
  `);

  /* ----------------------------------------------------------------------
     Move the invitations 004 stored as memberships
     ------------------------------------------------------------------- */

  const pending = await knex("organisation_members")
    .where({ status: "invited" })
    .select("*");

  for (const row of pending) {
    await knex("organisation_invitations").insert({
      organisation_id: row.organisation_id,
      profile_id: row.profile_id,
      email: row.email ?? "",
      invited_by: row.invited_by ?? row.organisation_id,
      system_role: row.system_role,
      participation_type: "employee",
      organisation_class: "member",
      designation: row.designation === "head" ? "head" : "member",
      title: row.title,
      status: "pending",
      created_at: row.created_at,
    });
  }

  await knex("organisation_members").where({ status: "invited" }).del();

  // Every surviving membership is a real one. "invited" is no longer a
  // membership status at all.
  await knex("organisation_members")
    .whereNot({ status: "active" })
    .update({ status: "active" });

  // A membership that never carried a joined_at is dated from its creation
  // so the timeline always has a start.
  await knex("organisation_members")
    .whereNull("joined_at")
    .update({ joined_at: knex.ref("created_at") });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("organisation_invitations");

  await knex.schema.alterTable("organisation_members", (table) => {
    table.dropColumn("participation_type");
    table.dropColumn("organisation_class");
    table.dropColumn("left_at");
  });
}
