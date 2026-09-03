import { apiRequest } from "./api";
import { downloadTextFile } from "./download";

/* ------------------------------------------------------------------------
   Skills / Education / Certifications — self only, under /api/profile
   --------------------------------------------------------------------- */

export type Skill = { id: number; name: string };

export function fetchSkills(): Promise<{ skills: Skill[] }> {
  return apiRequest("/api/profile/skills");
}

export function addSkill(name: string): Promise<{ message: string; skill: Skill }> {
  return apiRequest("/api/profile/skills", { method: "POST", body: { name } });
}

export function removeSkill(id: number): Promise<{ message: string }> {
  return apiRequest(`/api/profile/skills/${id}`, { method: "DELETE" });
}

export type Education = {
  id: number;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type EducationInput = {
  institution: string;
  degree?: string | null;
  fieldOfStudy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export function fetchEducation(): Promise<{ education: Education[] }> {
  return apiRequest("/api/profile/education");
}

export function addEducation(
  input: EducationInput,
): Promise<{ message: string; education: Education }> {
  return apiRequest("/api/profile/education", { method: "POST", body: input });
}

export function updateEducation(
  id: number,
  input: EducationInput,
): Promise<{ message: string; education: Education }> {
  return apiRequest(`/api/profile/education/${id}`, { method: "PATCH", body: input });
}

export function removeEducation(id: number): Promise<{ message: string }> {
  return apiRequest(`/api/profile/education/${id}`, { method: "DELETE" });
}

export type Certification = {
  id: number;
  name: string;
  issuingOrganisation: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  credentialUrl: string | null;
};

export type CertificationInput = {
  name: string;
  issuingOrganisation?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  credentialUrl?: string | null;
};

export function fetchCertifications(): Promise<{ certifications: Certification[] }> {
  return apiRequest("/api/profile/certifications");
}

export function addCertification(
  input: CertificationInput,
): Promise<{ message: string; certification: Certification }> {
  return apiRequest("/api/profile/certifications", { method: "POST", body: input });
}

export function updateCertification(
  id: number,
  input: CertificationInput,
): Promise<{ message: string; certification: Certification }> {
  return apiRequest(`/api/profile/certifications/${id}`, { method: "PATCH", body: input });
}

export function removeCertification(id: number): Promise<{ message: string }> {
  return apiRequest(`/api/profile/certifications/${id}`, { method: "DELETE" });
}

/* ------------------------------------------------------------------------
   CV / Portfolio — by profile id, under /api/profiles
   --------------------------------------------------------------------- */

export type CvExperience = {
  organisationId: number;
  organisationName: string;
  organisationType: string;
  title: string | null;
  designation: string;
  participationType: string;
  organisationClass: string;
  status: string;
  joinedAt: string | null;
  leftAt: string | null;
  positions: {
    positionId: number;
    positionName: string | null;
    startsAt: string;
    endsAt: string | null;
    isActive: boolean;
  }[];
  employment: unknown[];
};

export type VerifiedWork = {
  reportId: number;
  workItemId: number;
  organisationId: number;
  organisationName: string | null;
  title: string;
  whatWasDone: string;
  submittedAt: string | null;
  reviewedAt: string | null;
};

export type CvProject = {
  id: number;
  name: string;
  status: string;
  organisationName: string;
  role: "owner" | "member";
};

export type Cv = {
  profile: {
    id: number;
    fullName: string;
    username: string;
    headline: string | null;
    summary: string | null;
    profilePictureUrl: string | null;
    country: string | null;
    countryName: string | null;
  };
  skills: Skill[];
  education: (Education | null)[];
  certifications: (Certification | null)[];
  experience: CvExperience[];
  verifiedWork: VerifiedWork[];
  projects: CvProject[];
  outcomesOwned: unknown[];
  generatedAt: string;
};

export function fetchCv(profileId: number): Promise<{ cv: Cv }> {
  return apiRequest(`/api/profiles/${profileId}/cv`);
}

export function exportCv(
  profileId: number,
  format: "markdown" = "markdown",
): Promise<{ message: string; filename: string; contentType: string; content: string }> {
  return apiRequest(`/api/profiles/${profileId}/cv/export`, {
    method: "POST",
    body: { format },
  });
}

/** Triggers a browser download of the exported CV. */
export function downloadCv(result: { filename: string; contentType: string; content: string }) {
  downloadTextFile(result.filename, result.contentType, result.content);
}

export type PortfolioVisibility = "private" | "organisation" | "public";

export type Portfolio = {
  profile: {
    id: number;
    fullName: string;
    username: string;
    headline: string | null;
    summary: string | null;
    profilePictureUrl: string | null;
    countryName: string | null;
  };
  skills: Skill[];
  currentOrganisations: {
    organisationId: number;
    organisationName: string;
    title: string | null;
    designation: string;
  }[];
  featuredWork: VerifiedWork[];
  stats: { organisationsCount: number; verifiedWorkCount: number };
  visibility: PortfolioVisibility;
  isOwner: boolean;
};

export function fetchPortfolio(profileId: number): Promise<{ portfolio: Portfolio }> {
  return apiRequest(`/api/profiles/${profileId}/portfolio`);
}

export type PortfolioSettings = {
  visibility: PortfolioVisibility;
  featuredWorkItemIds: number[];
};

export function fetchPortfolioSettings(
  profileId: number,
): Promise<{ settings: PortfolioSettings }> {
  return apiRequest(`/api/profiles/${profileId}/portfolio/settings`);
}

export function updatePortfolioSettings(
  profileId: number,
  patch: Partial<{ visibility: PortfolioVisibility; featuredWorkItemIds: number[] }>,
): Promise<{ message: string; settings: PortfolioSettings }> {
  return apiRequest(`/api/profiles/${profileId}/portfolio/settings`, {
    method: "PATCH",
    body: patch,
  });
}
