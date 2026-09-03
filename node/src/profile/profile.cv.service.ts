import { findCountry } from "../shared/countries.js";
import { publicContract, publicEmploymentRecord } from "../employment/employment.service.js";
import {
  listContractsByEmploymentRecord,
  listEmploymentHistoryByMember,
} from "../employment/employment.repository.js";
import { listPositions } from "../hierarchy/hierarchy.repository.js";
import { listOccupancyHistoryByMember } from "../hierarchy/occupancy.repository.js";
import { listParticipation } from "../organisation/organisation.repository.js";
import type { MembershipWithOrganisation } from "../organisation/organisation.record.js";
import {
  listOutcomesForOrganisation,
  listProjectMembershipsForProfile,
  listProjects,
} from "../projects/project.repository.js";
import { publicOutcome, publicProject } from "../projects/project.service.js";
import { listAcceptedReportsForProfile } from "../work/work.repository.js";
import { publicWorkItem } from "../work/work.service.js";
import { findProfileById } from "./profile.repository.js";
import type { FieldError } from "./profile.validation.js";
import {
  findPortfolioSettings,
  insertCertification,
  insertEducation,
  insertSkill,
  deleteCertification,
  deleteEducation,
  deleteSkill,
  findCertificationById,
  findEducationById,
  findSkillById,
  listCertifications,
  listEducation,
  listFeaturedWork,
  listSkills,
  replaceFeaturedWork,
  updateCertification,
  updateEducation,
  upsertPortfolioSettings,
} from "./profile.cv.repository.js";
import {
  validateCertificationName,
  validateCredentialUrl,
  validateDateOrder,
  validateFeaturedWorkIds,
  validateInstitution,
  validateOptionalDate,
  validateOptionalShortText,
  validatePortfolioVisibility,
  validateSkillName,
} from "./profile.cv.validation.js";
import type { PortfolioVisibility } from "./profile.cv.record.js";

export class CvError extends Error {
  status: number;
  errors: FieldError[];

  constructor(status: number, errors: FieldError[]) {
    super(errors[0]?.message ?? "Request failed.");
    this.status = status;
    this.errors = errors;
  }

  static field(status: number, field: string, message: string): CvError {
    return new CvError(status, [{ field, message }]);
  }
}

async function requireProfile(profileId: number) {
  const record = await findProfileById(profileId);

  if (!record) {
    throw CvError.field(404, "form", "That person could not be found.");
  }

  return record;
}

/* ------------------------------------------------------------------------
   Skills / Education / Certifications — self-service only
   --------------------------------------------------------------------- */

export async function listMySkills(userId: number) {
  return { skills: (await listSkills(userId)).map((s) => ({ id: s.id, name: s.name })) };
}

export async function addSkill(userId: number, input: { name?: unknown }) {
  const name = validateSkillName(input.name);

  if (!name.ok) {
    throw new CvError(422, name.errors);
  }

  const existing = await listSkills(userId);

  if (existing.some((s) => s.name.toLowerCase() === name.value.toLowerCase())) {
    throw CvError.field(422, "name", "That skill is already on your profile.");
  }

  const row = await insertSkill({ profileId: userId, name: name.value, position: existing.length });

  return { message: "Skill added.", skill: { id: row.id, name: row.name } };
}

export async function removeSkill(userId: number, skillId: number) {
  const row = await findSkillById(skillId);

  if (!row || row.profile_id !== userId) {
    throw CvError.field(404, "form", "That skill could not be found.");
  }

  await deleteSkill(skillId);

  return { message: "Skill removed." };
}

function publicEducation(row: Awaited<ReturnType<typeof findEducationById>>) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    institution: row.institution,
    degree: row.degree,
    fieldOfStudy: row.field_of_study,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

export async function listMyEducation(userId: number) {
  return { education: (await listEducation(userId)).map((row) => publicEducation(row)) };
}

export type EducationInput = {
  institution?: unknown;
  degree?: unknown;
  fieldOfStudy?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

function validateEducationFields(input: EducationInput) {
  const institution = validateInstitution(input.institution);
  const degree = validateOptionalShortText(input.degree, "degree", 160);
  const fieldOfStudy = validateOptionalShortText(input.fieldOfStudy, "fieldOfStudy", 160);
  const startDate = validateOptionalDate(input.startDate, "startDate");
  const endDate = validateOptionalDate(input.endDate, "endDate");

  const errors: FieldError[] = [institution, degree, fieldOfStudy, startDate, endDate].flatMap(
    (r) => (r.ok ? [] : r.errors),
  );

  if (startDate.ok && endDate.ok) {
    errors.push(...validateDateOrder("startDate", startDate.value, endDate.value));
  }

  if (
    errors.length > 0 ||
    !institution.ok ||
    !degree.ok ||
    !fieldOfStudy.ok ||
    !startDate.ok ||
    !endDate.ok
  ) {
    throw new CvError(422, errors);
  }

  return {
    institution: institution.value,
    degree: degree.value,
    fieldOfStudy: fieldOfStudy.value,
    startDate: startDate.value,
    endDate: endDate.value,
  };
}

export async function addEducation(userId: number, input: EducationInput) {
  const fields = validateEducationFields(input);

  const row = await insertEducation({ profileId: userId, ...fields });

  return { message: "Education added.", education: publicEducation(row) };
}

export async function updateEducationEntry(
  userId: number,
  educationId: number,
  input: EducationInput,
) {
  const existing = await findEducationById(educationId);

  if (!existing || existing.profile_id !== userId) {
    throw CvError.field(404, "form", "That education entry could not be found.");
  }

  const fields = validateEducationFields(input);

  const row = await updateEducation(educationId, {
    institution: fields.institution,
    degree: fields.degree,
    field_of_study: fields.fieldOfStudy,
    start_date: fields.startDate,
    end_date: fields.endDate,
  });

  return { message: "Education updated.", education: publicEducation(row) };
}

export async function removeEducation(userId: number, educationId: number) {
  const existing = await findEducationById(educationId);

  if (!existing || existing.profile_id !== userId) {
    throw CvError.field(404, "form", "That education entry could not be found.");
  }

  await deleteEducation(educationId);

  return { message: "Education removed." };
}

function publicCertification(row: Awaited<ReturnType<typeof findCertificationById>>) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    issuingOrganisation: row.issuing_organisation,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    credentialUrl: row.credential_url,
  };
}

export async function listMyCertifications(userId: number) {
  return {
    certifications: (await listCertifications(userId)).map((row) => publicCertification(row)),
  };
}

export type CertificationInput = {
  name?: unknown;
  issuingOrganisation?: unknown;
  issuedAt?: unknown;
  expiresAt?: unknown;
  credentialUrl?: unknown;
};

function validateCertificationFields(input: CertificationInput) {
  const name = validateCertificationName(input.name);
  const issuingOrganisation = validateOptionalShortText(
    input.issuingOrganisation,
    "issuingOrganisation",
    160,
  );
  const issuedAt = validateOptionalDate(input.issuedAt, "issuedAt");
  const expiresAt = validateOptionalDate(input.expiresAt, "expiresAt");
  const credentialUrl = validateCredentialUrl(input.credentialUrl);

  const errors: FieldError[] = [
    name,
    issuingOrganisation,
    issuedAt,
    expiresAt,
    credentialUrl,
  ].flatMap((r) => (r.ok ? [] : r.errors));

  if (issuedAt.ok && expiresAt.ok) {
    errors.push(...validateDateOrder("issuedAt", issuedAt.value, expiresAt.value));
  }

  if (
    errors.length > 0 ||
    !name.ok ||
    !issuingOrganisation.ok ||
    !issuedAt.ok ||
    !expiresAt.ok ||
    !credentialUrl.ok
  ) {
    throw new CvError(422, errors);
  }

  return {
    name: name.value,
    issuingOrganisation: issuingOrganisation.value,
    issuedAt: issuedAt.value,
    expiresAt: expiresAt.value,
    credentialUrl: credentialUrl.value,
  };
}

export async function addCertification(userId: number, input: CertificationInput) {
  const fields = validateCertificationFields(input);

  const row = await insertCertification({ profileId: userId, ...fields });

  return { message: "Certification added.", certification: publicCertification(row) };
}

export async function updateCertificationEntry(
  userId: number,
  certificationId: number,
  input: CertificationInput,
) {
  const existing = await findCertificationById(certificationId);

  if (!existing || existing.profile_id !== userId) {
    throw CvError.field(404, "form", "That certification could not be found.");
  }

  const fields = validateCertificationFields(input);

  const row = await updateCertification(certificationId, {
    name: fields.name,
    issuing_organisation: fields.issuingOrganisation,
    issued_at: fields.issuedAt,
    expires_at: fields.expiresAt,
    credential_url: fields.credentialUrl,
  });

  return { message: "Certification updated.", certification: publicCertification(row) };
}

export async function removeCertification(userId: number, certificationId: number) {
  const existing = await findCertificationById(certificationId);

  if (!existing || existing.profile_id !== userId) {
    throw CvError.field(404, "form", "That certification could not be found.");
  }

  await deleteCertification(certificationId);

  return { message: "Certification removed." };
}

/* ------------------------------------------------------------------------
   Visibility
   --------------------------------------------------------------------- */

/**
 * Whether `viewerId` may see `profileId`'s CV/portfolio beyond what the
 * owner themself can always see: public visibility opens it to any signed-in
 * person; organisation visibility opens it to anyone who currently shares an
 * active organisation with the profile owner.
 */
async function canView(viewerId: number, profileId: number): Promise<boolean> {
  if (viewerId === profileId) {
    return true;
  }

  const settings = await findPortfolioSettings(profileId);
  const visibility = (settings?.visibility ?? "private") as PortfolioVisibility;

  if (visibility === "public") {
    return true;
  }

  if (visibility === "private") {
    return false;
  }

  const [ownerMemberships, viewerMemberships] = await Promise.all([
    listParticipation(profileId),
    listParticipation(viewerId),
  ]);

  const ownerActiveOrgs = new Set(
    ownerMemberships.filter((m) => m.status === "active").map((m) => m.organisation_id),
  );

  return viewerMemberships.some(
    (m) => m.status === "active" && ownerActiveOrgs.has(m.organisation_id),
  );
}

async function requireViewable(viewerId: number, profileId: number) {
  const profile = await requireProfile(profileId);

  if (!(await canView(viewerId, profileId))) {
    throw CvError.field(404, "form", "That person could not be found.");
  }

  return profile;
}

/* ------------------------------------------------------------------------
   CV aggregation
   --------------------------------------------------------------------- */

async function buildExperience(memberships: MembershipWithOrganisation[]) {
  const experience = [];

  for (const membership of memberships) {
    const [occupancyHistory, positions, employmentHistory] = await Promise.all([
      listOccupancyHistoryByMember(membership.organisation_id, membership.id),
      listPositions(membership.organisation_id),
      listEmploymentHistoryByMember(membership.id),
    ]);

    const positionsById = new Map(positions.map((p) => [p.id, p]));

    const employment = await Promise.all(
      employmentHistory.map(async (record) => ({
        employmentRecord: publicEmploymentRecord(record),
        contracts: (await listContractsByEmploymentRecord(record.id)).map(publicContract),
      })),
    );

    experience.push({
      organisationId: membership.organisation_id,
      organisationName: membership.organisation_name,
      organisationType: membership.organisation_type,
      title: membership.title,
      designation: membership.designation,
      participationType: membership.participation_type,
      organisationClass: membership.organisation_class,
      status: membership.status,
      joinedAt: membership.joined_at,
      leftAt: membership.left_at,
      positions: occupancyHistory.map((row) => ({
        positionId: row.position_id,
        positionName: positionsById.get(row.position_id)?.name ?? null,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        isActive: row.ends_at === null,
      })),
      employment,
    });
  }

  return experience;
}

async function buildVerifiedWork(profileId: number, orgNameById: Map<number, string>) {
  const reports = await listAcceptedReportsForProfile(profileId);

  return reports.map((report) => ({
    reportId: report.id,
    workItemId: report.work_item_id,
    organisationId: report.organisation_id,
    organisationName: orgNameById.get(report.organisation_id) ?? null,
    title: report.work_item.title,
    whatWasDone: report.body,
    submittedAt: report.submitted_at,
    reviewedAt: report.reviewed_at,
  }));
}

async function buildProjects(memberships: MembershipWithOrganisation[], profileId: number) {
  const projects = [];
  const outcomesOwned = [];

  for (const membership of memberships) {
    const [owned, memberOf, allOutcomes] = await Promise.all([
      listProjects(membership.organisation_id),
      listProjectMembershipsForProfile(membership.organisation_id, profileId),
      listOutcomesForOrganisation(membership.organisation_id),
    ]);

    const projectMap = new Map(
      [...owned.filter((p) => p.owner_profile_id === profileId), ...memberOf].map((p) => [
        p.id,
        p,
      ]),
    );

    for (const project of projectMap.values()) {
      projects.push({
        ...publicProject(project),
        organisationName: membership.organisation_name,
        role: project.owner_profile_id === profileId ? "owner" : "member",
      });
    }

    outcomesOwned.push(
      ...allOutcomes
        .filter((o) => o.owner_profile_id === profileId)
        .map((o) => ({ ...publicOutcome(o), organisationName: membership.organisation_name })),
    );
  }

  return { projects, outcomesOwned };
}

export type CvData = Awaited<ReturnType<typeof getCv>>["cv"];

export async function getCv(viewerId: number, profileId: number) {
  const record = await requireViewable(viewerId, profileId);

  const [memberships, skills, education, certifications] = await Promise.all([
    listParticipation(profileId),
    listSkills(profileId),
    listEducation(profileId),
    listCertifications(profileId),
  ]);

  const orgNameById = new Map(memberships.map((m) => [m.organisation_id, m.organisation_name]));

  const [experience, verifiedWork, { projects, outcomesOwned }] = await Promise.all([
    buildExperience(memberships),
    buildVerifiedWork(profileId, orgNameById),
    buildProjects(memberships, profileId),
  ]);

  const country = findCountry(record.country);

  return {
    cv: {
      profile: {
        id: record.id,
        fullName: record.full_name,
        username: record.username,
        headline: record.headline,
        summary: record.summary,
        profilePictureUrl: record.profile_picture_url,
        country: record.country,
        countryName: country?.name ?? null,
      },
      skills: skills.map((s) => ({ id: s.id, name: s.name })),
      education: education.map((row) => publicEducation(row)),
      certifications: certifications.map((row) => publicCertification(row)),
      experience,
      verifiedWork,
      projects,
      outcomesOwned,
      generatedAt: new Date().toISOString(),
    },
  };
}

/* ------------------------------------------------------------------------
   Portfolio — a curated, sharing-safe view of the same record
   --------------------------------------------------------------------- */

export async function getPortfolio(viewerId: number, profileId: number) {
  const record = await requireViewable(viewerId, profileId);

  const [memberships, skills, settings, featured] = await Promise.all([
    listParticipation(profileId),
    listSkills(profileId),
    findPortfolioSettings(profileId),
    listFeaturedWork(profileId),
  ]);

  const orgNameById = new Map(memberships.map((m) => [m.organisation_id, m.organisation_name]));
  const verifiedWork = await buildVerifiedWork(profileId, orgNameById);
  const verifiedByWorkItem = new Map(verifiedWork.map((w) => [w.workItemId, w]));

  const featuredWork = featured
    .map((row) => verifiedByWorkItem.get(row.work_item_id))
    .filter((w): w is NonNullable<typeof w> => w !== undefined);

  const activeOrgs = memberships.filter((m) => m.status === "active");

  const country = findCountry(record.country);

  return {
    portfolio: {
      profile: {
        id: record.id,
        fullName: record.full_name,
        username: record.username,
        headline: record.headline,
        summary: record.summary,
        profilePictureUrl: record.profile_picture_url,
        countryName: country?.name ?? null,
      },
      skills: skills.map((s) => ({ id: s.id, name: s.name })),
      currentOrganisations: activeOrgs.map((m) => ({
        organisationId: m.organisation_id,
        organisationName: m.organisation_name,
        title: m.title,
        designation: m.designation,
      })),
      featuredWork,
      stats: {
        organisationsCount: new Set(memberships.map((m) => m.organisation_id)).size,
        verifiedWorkCount: verifiedWork.length,
      },
      visibility: (settings?.visibility ?? "private") as PortfolioVisibility,
      isOwner: viewerId === profileId,
    },
  };
}

/* ------------------------------------------------------------------------
   Portfolio settings — owner only
   --------------------------------------------------------------------- */

export async function getPortfolioSettings(userId: number) {
  const [settings, featured] = await Promise.all([
    upsertPortfolioSettings(userId, {}),
    listFeaturedWork(userId),
  ]);

  return {
    settings: {
      visibility: settings.visibility as PortfolioVisibility,
      featuredWorkItemIds: featured.map((row) => row.work_item_id),
    },
  };
}

export type PortfolioSettingsInput = {
  visibility?: unknown;
  featuredWorkItemIds?: unknown;
};

export async function updatePortfolioSettingsForOwner(
  userId: number,
  input: PortfolioSettingsInput,
) {
  const patch: { visibility?: string } = {};

  if (input.visibility !== undefined) {
    const visibility = validatePortfolioVisibility(input.visibility);

    if (!visibility.ok) {
      throw new CvError(422, visibility.errors);
    }

    patch.visibility = visibility.value;
  }

  let featuredWorkItemIds: number[] | undefined;

  if (input.featuredWorkItemIds !== undefined) {
    const result = validateFeaturedWorkIds(input.featuredWorkItemIds);

    if (!result.ok) {
      throw new CvError(422, result.errors);
    }

    // Only the owner's own verified (accepted-report) work may be featured —
    // featuring somebody else's work, or work that was never reviewed, would
    // make the portfolio claim something that isn't true.
    const verified = await listAcceptedReportsForProfile(userId);
    const verifiedWorkItemIds = new Set(verified.map((r) => r.work_item_id));

    const invalid = result.value.filter((id) => !verifiedWorkItemIds.has(id));

    if (invalid.length > 0) {
      throw CvError.field(
        422,
        "workItemIds",
        "Only your own verified work can be featured.",
      );
    }

    featuredWorkItemIds = result.value;
  }

  const [settings] = await Promise.all([
    upsertPortfolioSettings(userId, patch),
    featuredWorkItemIds === undefined
      ? Promise.resolve(null)
      : replaceFeaturedWork(userId, featuredWorkItemIds),
  ]);

  const featured = await listFeaturedWork(userId);

  return {
    message: "Portfolio settings updated.",
    settings: {
      visibility: settings.visibility as PortfolioVisibility,
      featuredWorkItemIds: featured.map((row) => row.work_item_id),
    },
  };
}

/* ------------------------------------------------------------------------
   Export
   --------------------------------------------------------------------- */

function escapeMd(value: string): string {
  return value.replace(/([_*`[\]])/g, "\\$1");
}

/**
 * Timestamp columns come back from pg/knex as Date objects, not strings,
 * despite the record types saying `string` (true only after a value has
 * passed through Express's res.json(), which calls toJSON() for us). Export
 * builds markdown directly from the raw aggregate, before that happens, so
 * dates are normalized defensively here.
 */
function toDateOnly(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function formatRange(startRaw: unknown, endRaw: unknown): string {
  const from = toDateOnly(startRaw) ?? "?";
  const to = toDateOnly(endRaw) ?? "Present";

  return `${from} – ${to}`;
}

function renderCvMarkdown(cv: Awaited<ReturnType<typeof getCv>>["cv"]): string {
  const lines: string[] = [];

  lines.push(`# ${escapeMd(cv.profile.fullName)}`);

  if (cv.profile.headline) {
    lines.push(`_${escapeMd(cv.profile.headline)}_`);
  }

  lines.push("");

  if (cv.profile.summary) {
    lines.push("## Summary", "", cv.profile.summary, "");
  }

  if (cv.skills.length > 0) {
    lines.push("## Skills", "", cv.skills.map((s) => escapeMd(s.name)).join(", "), "");
  }

  if (cv.experience.length > 0) {
    lines.push("## Experience", "");

    for (const entry of cv.experience) {
      lines.push(
        `### ${escapeMd(entry.organisationName)} — ${escapeMd(entry.title ?? entry.designation)}`,
      );
      lines.push(formatRange(entry.joinedAt, entry.leftAt));

      for (const position of entry.positions) {
        if (position.positionName) {
          lines.push(
            `- ${escapeMd(position.positionName)} (${formatRange(position.startsAt, position.endsAt)})`,
          );
        }
      }

      lines.push("");
    }
  }

  if (cv.verifiedWork.length > 0) {
    lines.push("## Verified work", "");

    for (const work of cv.verifiedWork) {
      lines.push(
        `- **${escapeMd(work.title)}** — ${escapeMd(work.organisationName ?? "")} (reviewed ${
          toDateOnly(work.reviewedAt) ?? "?"
        })`,
      );
      lines.push(`  ${escapeMd(work.whatWasDone).replace(/\n/g, "\n  ")}`);
    }

    lines.push("");
  }

  if (cv.projects.length > 0) {
    lines.push("## Projects", "");

    for (const project of cv.projects) {
      lines.push(`- ${escapeMd(project.name)} — ${escapeMd(project.organisationName)}`);
    }

    lines.push("");
  }

  if (cv.education.length > 0) {
    lines.push("## Education", "");

    for (const entry of cv.education) {
      if (!entry) continue;
      const heading = entry.degree
        ? `${escapeMd(entry.degree)}, ${escapeMd(entry.institution)}`
        : escapeMd(entry.institution);
      lines.push(`- ${heading} (${formatRange(entry.startDate, entry.endDate)})`);
    }

    lines.push("");
  }

  if (cv.certifications.length > 0) {
    lines.push("## Certifications", "");

    for (const entry of cv.certifications) {
      if (!entry) continue;
      lines.push(
        `- ${escapeMd(entry.name)}${entry.issuingOrganisation ? ` — ${escapeMd(entry.issuingOrganisation)}` : ""}`,
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}

export async function exportCv(
  viewerId: number,
  profileId: number,
  format: unknown,
) {
  const requestedFormat = String(format ?? "markdown").trim().toLowerCase();

  if (requestedFormat !== "markdown") {
    throw CvError.field(
      422,
      "format",
      "Only markdown export is available right now.",
    );
  }

  const { cv } = await getCv(viewerId, profileId);

  return {
    message: "Your CV is ready to download.",
    filename: `${cv.profile.username}-cv.md`,
    contentType: "text/markdown",
    content: renderCvMarkdown(cv),
  };
}
