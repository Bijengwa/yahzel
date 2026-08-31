import type { Knex } from "knex";

/**
 * Every organisation must have a Head position from the moment it exists
 * (see organisation.repository.ts's createOrganisationWithAdmin, which now
 * inserts one at registration time). This backfills organisations created
 * before that guarantee existed.
 *
 * "Already has a Head" is read structurally, not by name: any organisation
 * that already has at least one root position (parent_position_id IS NULL)
 * is left untouched, whether that root is literally named "Head" or was
 * already renamed to something like "Chief Executive Officer" — either way
 * it already serves as the organisation's head, and inserting a second root
 * would create a duplicate. Only organisations with zero root positions
 * receive one.
 *
 * The INSERT ... WHERE NOT EXISTS shape makes this idempotent: running it
 * again after every organisation already has a root inserts nothing.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    INSERT INTO positions (organisation_id, name, parent_position_id, created_at, updated_at)
    SELECT o.id, 'Head', NULL, now(), now()
    FROM organisations o
    WHERE NOT EXISTS (
      SELECT 1 FROM positions p
      WHERE p.organisation_id = o.id AND p.parent_position_id IS NULL
    )
  `);
}

export async function down(): Promise<void> {
  // Deliberately a no-op: this is a data backfill, not a schema change.
  // There is no reliable way to tell a backfilled Head apart from one an
  // admin created deliberately afterward, so reversing this migration
  // cannot safely delete "the rows it added" without risking deleting a
  // legitimate Head created later. Rolling back only ever removes the
  // schema migrations that follow this one.
}
