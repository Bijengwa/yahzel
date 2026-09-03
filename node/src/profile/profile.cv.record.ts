/**
 * The tables migration 022 added: what a CV/portfolio needs that has no other
 * home in the schema. Everything else a CV shows (organisations, positions,
 * employment, verified work) is read from the domains that already own it.
 */

export const PROFILE_SKILLS_TABLE = "profile_skills";
export const PROFILE_EDUCATION_TABLE = "profile_education";
export const PROFILE_CERTIFICATIONS_TABLE = "profile_certifications";
export const PORTFOLIO_SETTINGS_TABLE = "portfolio_settings";
export const PORTFOLIO_FEATURED_WORK_TABLE = "portfolio_featured_work";

export type ProfileSkillRecord = {
  id: number;
  profile_id: number;
  name: string;
  position: number;
  created_at: string;
};

export type ProfileEducationRecord = {
  id: number;
  profile_id: number;
  institution: string;
  degree: string | null;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileCertificationRecord = {
  id: number;
  profile_id: number;
  name: string;
  issuing_organisation: string | null;
  issued_at: string | null;
  expires_at: string | null;
  credential_url: string | null;
  created_at: string;
  updated_at: string;
};

/** private | organisation | public. */
export const PORTFOLIO_VISIBILITIES = ["private", "organisation", "public"] as const;
export type PortfolioVisibility = (typeof PORTFOLIO_VISIBILITIES)[number];

export function isPortfolioVisibility(value: string): value is PortfolioVisibility {
  return (PORTFOLIO_VISIBILITIES as readonly string[]).includes(value);
}

export type PortfolioSettingsRecord = {
  id: number;
  profile_id: number;
  visibility: string;
  created_at: string;
  updated_at: string;
};

export type PortfolioFeaturedWorkRecord = {
  id: number;
  profile_id: number;
  work_item_id: number;
  position: number;
  created_at: string;
};
