export const OPERATIONAL_SIGNALS_TABLE = "operational_signals";

/**
 * Every signal type this phase detects. Adding one is a code change here
 * plus a detector in intelligence.signal.service.ts — never a migration.
 */
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

export function isSignalType(value: string): value is SignalType {
  return (SIGNAL_TYPES as readonly string[]).includes(value);
}

export const SIGNAL_ENTITY_TYPES = [
  "work_item",
  "project",
  "project_outcome",
  "contract",
] as const;

export type SignalEntityType = (typeof SIGNAL_ENTITY_TYPES)[number];

export const SIGNAL_STATUSES = ["active", "resolved"] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export const SIGNAL_SEVERITIES = ["normal", "high"] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];

export const SIGNAL_RESOLUTIONS = ["manual", "condition_cleared"] as const;
export type SignalResolution = (typeof SIGNAL_RESOLUTIONS)[number];

export type OperationalSignalRecord = {
  id: number;
  organisation_id: number;
  type: string;
  entity_type: string;
  entity_id: number;
  status: string;
  severity: string;
  message: string;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
};
