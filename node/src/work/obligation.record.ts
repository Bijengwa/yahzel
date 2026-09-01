export const WORK_SETTINGS_TABLE = "organisation_work_settings";
export const WORK_CAPABILITIES_TABLE = "work_capabilities";
export const WORK_SCHEDULES_TABLE = "work_schedules";
export const WORK_SCHEDULE_OCCURRENCES_TABLE = "work_schedule_occurrences";
export const CONTRACT_EXPIRY_NOTICES_TABLE = "contract_expiry_notices";
export const WORK_STALL_NOTICES_TABLE = "work_stall_notices";

export type WorkSettingsRecord = {
  id: number;
  organisation_id: number;
  contract_notice_days: number;
  stalled_inactive_days: number;
  stalled_blocked_days: number;
  created_at: string;
  updated_at: string;
};

export type WorkCapabilityRecord = {
  id: number;
  organisation_id: number;
  key: string;
  name: string;
  description: string | null;
  suggested_title: string;
  suggested_description: string | null;
  suggested_expected_output: string | null;
  checklist_json: string | null;
  default_assignee_rule: string;
  cadence: string | null;
  evidence_expectation: string | null;
  built_in: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkScheduleRecord = {
  id: number;
  organisation_id: number;
  capability_id: number;
  cadence: string;
  next_run_on: string;
  last_generated_on: string | null;
  assignee_profile_id: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkScheduleOccurrenceRecord = {
  id: number;
  organisation_id: number;
  schedule_id: number;
  occurrence_key: string;
  work_item_id: number;
  created_at: string;
};

export type ContractExpiryNoticeRecord = {
  id: number;
  organisation_id: number;
  contract_id: number;
  work_item_id: number | null;
  notified_at: string;
};

export type WorkStallNoticeRecord = {
  id: number;
  organisation_id: number;
  work_item_id: number;
  kind: string;
  notified_at: string;
};
