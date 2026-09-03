import { apiRequest } from "./api";

/* ------------------------------------------------------------------------
   Attention — mirrors node/src/intelligence/intelligence.signal.service.ts
   --------------------------------------------------------------------- */

export const SIGNAL_TYPES = [
  "work.overdue",
  "work.blocked",
  "work.stalled",
  "project.inactive",
  "project.target_approaching",
  "outcome.overdue",
  "contract.expiring",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  "work.overdue": "Work overdue",
  "work.blocked": "Work blocked",
  "work.stalled": "Work stalled",
  "project.inactive": "Project inactive",
  "project.target_approaching": "Project target approaching",
  "outcome.overdue": "Outcome overdue",
  "contract.expiring": "Contract expiring",
};

export function signalTypeLabel(type: string): string {
  return SIGNAL_TYPE_LABELS[type as SignalType] ?? type;
}

export type AttentionItem = {
  id: number;
  organisationId: number;
  type: string;
  entityType: string;
  entityId: number;
  status: "active" | "resolved";
  severity: "normal" | "high";
  message: string;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedBy: number | null;
  resolution: string | null;
  actionUrl: string | null;
};

export function fetchAttention(organisationId: number): Promise<{ attention: AttentionItem[] }> {
  return apiRequest(`/api/intelligence/${organisationId}/attention`);
}

export function runAttentionScan(
  organisationId: number,
): Promise<{ message: string; attention: AttentionItem[] }> {
  return apiRequest(`/api/intelligence/${organisationId}/attention/scan`, { method: "POST" });
}

export function resolveAttentionItem(
  organisationId: number,
  signalId: number,
): Promise<{ message: string; attention: AttentionItem }> {
  return apiRequest(`/api/intelligence/${organisationId}/attention/${signalId}/resolve`, {
    method: "POST",
  });
}

/* ------------------------------------------------------------------------
   Overview
   --------------------------------------------------------------------- */

export type OrganisationOverview = {
  people: { activeMembers: number; occupiedPositions: number; vacantPositions: number };
  work: { total: number; open: number; completed: number; overdue: number; blocked: number; stalled: number };
  projects: { active: number; paused: number; completed: number; requiringAttention: number };
  outcomes: { total: number; open: number; completed: number; overdue: number; approachingTarget: number };
  attention: { active: number; byType: Record<SignalType, number> };
};

export function fetchOverview(organisationId: number): Promise<OrganisationOverview> {
  return apiRequest(`/api/intelligence/${organisationId}/overview`);
}

/* ------------------------------------------------------------------------
   Activity
   --------------------------------------------------------------------- */

export type ActivityEntry = { id: string; type: string; message: string; occurredAt: string };

export function fetchActivity(organisationId: number): Promise<{ activity: ActivityEntry[] }> {
  return apiRequest(`/api/intelligence/${organisationId}/activity`);
}

/* ------------------------------------------------------------------------
   Search
   --------------------------------------------------------------------- */

export type SearchResultItem = {
  type: "person" | "position" | "department" | "work" | "project" | "outcome";
  id: number;
  title: string;
  subtitle: string;
  url: string;
};

export type SearchResults = {
  query: string;
  results: Record<"people" | "positions" | "departments" | "work" | "projects" | "outcomes", SearchResultItem[]>;
};

export function searchOrganisation(organisationId: number, q: string): Promise<SearchResults> {
  return apiRequest(`/api/intelligence/${organisationId}/search?q=${encodeURIComponent(q)}`);
}

/* ------------------------------------------------------------------------
   Person operational history
   --------------------------------------------------------------------- */

export type MemberOperationalHistory = {
  memberId: number;
  profileId: number | null;
  membership: { id: number; title: string | null; organisationClassLabel: string; status: string; joinedAt: string | null; leftAt: string | null };
  structure: {
    positions: { positionId: number; positionName: string | null; startsAt: string; endsAt: string | null; isActive: boolean }[];
    departments: { id: number; name: string }[];
  };
  employment: {
    employmentRecord: { id: number; isCurrent: boolean; startDate: string; endDate: string | null };
    contracts: { id: number; contractTypeLabel: string; isActive: boolean; startDate: string; endDate: string | null }[];
  }[];
  work: {
    items: { id: number; title: string; status: string }[];
    reports: { id: number; workItemId: number; state: string; submittedAt: string | null; reviewedAt: string | null }[];
    evidence: { id: number; workItemId: number; fileName: string; createdAt: string }[];
  };
  projects: {
    memberships: { id: number; name: string; status: string }[];
    outcomesOwned: { id: number; title: string; status: string }[];
  };
};

export function fetchMemberHistory(
  organisationId: number,
  memberId: number,
): Promise<MemberOperationalHistory> {
  return apiRequest(`/api/intelligence/${organisationId}/members/${memberId}/history`);
}
