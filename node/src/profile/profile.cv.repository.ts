import { db } from "../db/knex.js";
import {
  PORTFOLIO_FEATURED_WORK_TABLE,
  PORTFOLIO_SETTINGS_TABLE,
  PROFILE_CERTIFICATIONS_TABLE,
  PROFILE_EDUCATION_TABLE,
  PROFILE_SKILLS_TABLE,
  type PortfolioFeaturedWorkRecord,
  type PortfolioSettingsRecord,
  type ProfileCertificationRecord,
  type ProfileEducationRecord,
  type ProfileSkillRecord,
} from "./profile.cv.record.js";

const now = () => db.fn.now() as unknown as string;

/* ------------------------------------------------------------------------
   Skills
   --------------------------------------------------------------------- */

export function listSkills(profileId: number): Promise<ProfileSkillRecord[]> {
  return db<ProfileSkillRecord>(PROFILE_SKILLS_TABLE)
    .where({ profile_id: profileId })
    .orderBy([{ column: "position", order: "asc" }, { column: "id", order: "asc" }]);
}

export function findSkillById(id: number) {
  return db<ProfileSkillRecord>(PROFILE_SKILLS_TABLE).where({ id }).first();
}

export async function insertSkill(input: {
  profileId: number;
  name: string;
  position: number;
}): Promise<ProfileSkillRecord> {
  const [row] = await db<ProfileSkillRecord>(PROFILE_SKILLS_TABLE)
    .insert({ profile_id: input.profileId, name: input.name, position: input.position })
    .returning("*");

  if (!row) {
    throw new Error("The skill row was not returned after insert.");
  }

  return row;
}

export async function deleteSkill(id: number): Promise<void> {
  await db<ProfileSkillRecord>(PROFILE_SKILLS_TABLE).where({ id }).del();
}

/* ------------------------------------------------------------------------
   Education
   --------------------------------------------------------------------- */

export function listEducation(profileId: number): Promise<ProfileEducationRecord[]> {
  return db<ProfileEducationRecord>(PROFILE_EDUCATION_TABLE)
    .where({ profile_id: profileId })
    .orderBy([{ column: "start_date", order: "desc" }, { column: "id", order: "desc" }]);
}

export function findEducationById(id: number) {
  return db<ProfileEducationRecord>(PROFILE_EDUCATION_TABLE).where({ id }).first();
}

export async function insertEducation(input: {
  profileId: number;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
}): Promise<ProfileEducationRecord> {
  const [row] = await db<ProfileEducationRecord>(PROFILE_EDUCATION_TABLE)
    .insert({
      profile_id: input.profileId,
      institution: input.institution,
      degree: input.degree,
      field_of_study: input.fieldOfStudy,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .returning("*");

  if (!row) {
    throw new Error("The education row was not returned after insert.");
  }

  return row;
}

export async function updateEducation(
  id: number,
  patch: Partial<{
    institution: string;
    degree: string | null;
    field_of_study: string | null;
    start_date: string | null;
    end_date: string | null;
  }>,
): Promise<ProfileEducationRecord> {
  const [row] = await db<ProfileEducationRecord>(PROFILE_EDUCATION_TABLE)
    .where({ id })
    .update({ ...patch, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Education row ${id} disappeared during update.`);
  }

  return row;
}

export async function deleteEducation(id: number): Promise<void> {
  await db<ProfileEducationRecord>(PROFILE_EDUCATION_TABLE).where({ id }).del();
}

/* ------------------------------------------------------------------------
   Certifications
   --------------------------------------------------------------------- */

export function listCertifications(
  profileId: number,
): Promise<ProfileCertificationRecord[]> {
  return db<ProfileCertificationRecord>(PROFILE_CERTIFICATIONS_TABLE)
    .where({ profile_id: profileId })
    .orderBy([{ column: "issued_at", order: "desc" }, { column: "id", order: "desc" }]);
}

export function findCertificationById(id: number) {
  return db<ProfileCertificationRecord>(PROFILE_CERTIFICATIONS_TABLE)
    .where({ id })
    .first();
}

export async function insertCertification(input: {
  profileId: number;
  name: string;
  issuingOrganisation: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  credentialUrl: string | null;
}): Promise<ProfileCertificationRecord> {
  const [row] = await db<ProfileCertificationRecord>(PROFILE_CERTIFICATIONS_TABLE)
    .insert({
      profile_id: input.profileId,
      name: input.name,
      issuing_organisation: input.issuingOrganisation,
      issued_at: input.issuedAt,
      expires_at: input.expiresAt,
      credential_url: input.credentialUrl,
    })
    .returning("*");

  if (!row) {
    throw new Error("The certification row was not returned after insert.");
  }

  return row;
}

export async function updateCertification(
  id: number,
  patch: Partial<{
    name: string;
    issuing_organisation: string | null;
    issued_at: string | null;
    expires_at: string | null;
    credential_url: string | null;
  }>,
): Promise<ProfileCertificationRecord> {
  const [row] = await db<ProfileCertificationRecord>(PROFILE_CERTIFICATIONS_TABLE)
    .where({ id })
    .update({ ...patch, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Certification row ${id} disappeared during update.`);
  }

  return row;
}

export async function deleteCertification(id: number): Promise<void> {
  await db<ProfileCertificationRecord>(PROFILE_CERTIFICATIONS_TABLE).where({ id }).del();
}

/* ------------------------------------------------------------------------
   Portfolio settings — one row per profile, created lazily.
   --------------------------------------------------------------------- */

export function findPortfolioSettings(profileId: number) {
  return db<PortfolioSettingsRecord>(PORTFOLIO_SETTINGS_TABLE)
    .where({ profile_id: profileId })
    .first();
}

export async function upsertPortfolioSettings(
  profileId: number,
  patch: { visibility?: string },
): Promise<PortfolioSettingsRecord> {
  const existing = await findPortfolioSettings(profileId);

  if (!existing) {
    const [row] = await db<PortfolioSettingsRecord>(PORTFOLIO_SETTINGS_TABLE)
      .insert({
        profile_id: profileId,
        visibility: patch.visibility ?? "private",
      })
      .returning("*");

    if (!row) {
      throw new Error("The portfolio settings row was not returned after insert.");
    }

    return row;
  }

  if (patch.visibility === undefined) {
    return existing;
  }

  const [row] = await db<PortfolioSettingsRecord>(PORTFOLIO_SETTINGS_TABLE)
    .where({ profile_id: profileId })
    .update({ visibility: patch.visibility, updated_at: now() })
    .returning("*");

  if (!row) {
    throw new Error(`Portfolio settings for profile ${profileId} disappeared during update.`);
  }

  return row;
}

/* ------------------------------------------------------------------------
   Featured work
   --------------------------------------------------------------------- */

export function listFeaturedWork(
  profileId: number,
): Promise<PortfolioFeaturedWorkRecord[]> {
  return db<PortfolioFeaturedWorkRecord>(PORTFOLIO_FEATURED_WORK_TABLE)
    .where({ profile_id: profileId })
    .orderBy([{ column: "position", order: "asc" }, { column: "id", order: "asc" }]);
}

/**
 * Replaces the whole featured set in one transaction — the caller always
 * sends the complete, ordered list it wants, so there is no separate
 * add/remove/reorder trio to keep in sync with each other.
 */
export async function replaceFeaturedWork(
  profileId: number,
  workItemIds: number[],
): Promise<PortfolioFeaturedWorkRecord[]> {
  return db.transaction(async (trx) => {
    await trx(PORTFOLIO_FEATURED_WORK_TABLE).where({ profile_id: profileId }).del();

    if (workItemIds.length === 0) {
      return [];
    }

    return trx<PortfolioFeaturedWorkRecord>(PORTFOLIO_FEATURED_WORK_TABLE)
      .insert(
        workItemIds.map((workItemId, index) => ({
          profile_id: profileId,
          work_item_id: workItemId,
          position: index,
        })),
      )
      .returning("*");
  });
}
