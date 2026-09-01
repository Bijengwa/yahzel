export const BLOCKED_REASONS = [
  "waiting_approval",
  "waiting_other_unit",
  "missing_information",
  "external_party",
  "resource",
  "other",
] as const;

export type BlockedReason = (typeof BLOCKED_REASONS)[number];

export function isBlockedReason(value: string): value is BlockedReason {
  return (BLOCKED_REASONS as readonly string[]).includes(value);
}

export const BLOCKED_REASON_LABELS: Record<BlockedReason, string> = {
  waiting_approval: "Waiting for approval",
  waiting_other_unit: "Waiting on another unit",
  missing_information: "Missing information",
  external_party: "Waiting on an external party",
  resource: "Waiting on a resource",
  other: "Other",
};

export const CADENCES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type Cadence = (typeof CADENCES)[number];

export function isCadence(value: string): value is Cadence {
  return (CADENCES as readonly string[]).includes(value);
}

export const ASSIGNEE_RULES = ["caller", "admin"] as const;
export type AssigneeRule = (typeof ASSIGNEE_RULES)[number];

export function isAssigneeRule(value: string): value is AssigneeRule {
  return (ASSIGNEE_RULES as readonly string[]).includes(value);
}

export const DEFAULT_CONTRACT_NOTICE_DAYS = 30;
export const DEFAULT_STALLED_INACTIVE_DAYS = 14;
export const DEFAULT_STALLED_BLOCKED_DAYS = 7;

export const BUILT_IN_CAPABILITIES = [
  {
    key: "onboarding",
    name: "Onboarding",
    description: "Welcome a new member and complete the organisation's joining steps.",
    suggestedTitle: "Onboard new member",
    suggestedDescription:
      "Complete onboarding for the referenced person. Record placement, employment and contract work as ordinary Work — do not invent a second staffing path.",
    suggestedExpectedOutput: "Onboarding checklist completed and recorded as a Work report.",
    evidenceExpectation: "Submitted Work report listing completed steps.",
    defaultAssigneeRule: "admin" as const,
    cadence: null as string | null,
  },
  {
    key: "hiring",
    name: "Hiring / recruitment work",
    description: "Organisational hiring work. Not an ATS — ordinary Work about filling a need.",
    suggestedTitle: "Hiring work",
    suggestedDescription:
      "Carry out the hiring work for this role. Recruitment tools live outside Yahzel; this is the organisational Work of filling the need.",
    suggestedExpectedOutput: "A recorded outcome: role filled, paused, or cancelled.",
    evidenceExpectation: "Decision recorded on a Work report.",
    defaultAssigneeRule: "admin" as const,
    cadence: null as string | null,
  },
  {
    key: "contract_creation",
    name: "Contract creation",
    description: "Create a first or replacement contract on an employment record.",
    suggestedTitle: "Create contract",
    suggestedDescription:
      "Open a contract on the referenced employment record. Do not rewrite historical contracts.",
    suggestedExpectedOutput: "A new contract row on the employment record.",
    evidenceExpectation: "Contract type and dates.",
    defaultAssigneeRule: "admin" as const,
    cadence: null as string | null,
  },
  {
    key: "contract_review",
    name: "Contract review",
    description: "Review a contract approaching its end date.",
    suggestedTitle: "Review expiring contract",
    suggestedDescription:
      "Review the referenced contract and decide whether to extend, convert, or end it. History is kept.",
    suggestedExpectedOutput: "A recorded decision: extend, convert, or end.",
    evidenceExpectation: "Decision and effective date.",
    defaultAssigneeRule: "admin" as const,
    cadence: null as string | null,
  },
  {
    key: "contract_renewal",
    name: "Contract renewal",
    description: "Renew by ending the current contract as history and opening a successor.",
    suggestedTitle: "Renew contract",
    suggestedDescription:
      "The current contract stays as history. Open a successor contract on the same employment record.",
    suggestedExpectedOutput: "Ended previous contract plus a new active contract.",
    evidenceExpectation: "Old and new dates.",
    defaultAssigneeRule: "admin" as const,
    cadence: null as string | null,
  },
  {
    key: "contract_extend",
    name: "Contract extension",
    description: "Prepare a successor contract that continues the current one.",
    suggestedTitle: "Extend contract",
    suggestedDescription:
      "Prepare the successor contract. The current contract stays as history.",
    suggestedExpectedOutput: "A new active contract on the same employment record.",
    evidenceExpectation: "New contract dates and type.",
    defaultAssigneeRule: "admin" as const,
    cadence: null as string | null,
  },
  {
    key: "contract_convert",
    name: "Contract conversion",
    description: "Convert one contract type into another without editing history.",
    suggestedTitle: "Convert contract",
    suggestedDescription:
      "End the current contract as history and open a replacement of a different type.",
    suggestedExpectedOutput: "Ended previous contract plus a new active contract.",
    evidenceExpectation: "Old type, new type, and effective date.",
    defaultAssigneeRule: "admin" as const,
    cadence: null as string | null,
  },
  {
    key: "contract_exit",
    name: "Employment exit",
    description: "Close the employment relationship when a contract ends.",
    suggestedTitle: "End employment relationship",
    suggestedDescription: "Conclude the employment record. History is kept.",
    suggestedExpectedOutput: "Employment record ended.",
    evidenceExpectation: "Exit date recorded on employment notes.",
    defaultAssigneeRule: "admin" as const,
    cadence: null as string | null,
  },
  {
    key: "placement_transfer",
    name: "Placement / transfer",
    description: "Move a person using existing occupancy and department primitives.",
    suggestedTitle: "Place or transfer member",
    suggestedDescription:
      "Use existing occupancy and department membership — do not duplicate staffing authority here.",
    suggestedExpectedOutput: "Updated occupancy and/or department membership.",
    evidenceExpectation: "Position and department after the move.",
    defaultAssigneeRule: "admin" as const,
    cadence: null as string | null,
  },
  {
    key: "periodic_check_in",
    name: "Periodic organisational check-in",
    description: "A recurring organisational check-in that creates ordinary Work.",
    suggestedTitle: "Periodic check-in",
    suggestedDescription: "Complete the scheduled check-in and record what moved.",
    suggestedExpectedOutput: "A short written update.",
    evidenceExpectation: "A submitted Work report.",
    defaultAssigneeRule: "caller" as const,
    cadence: "monthly" as string | null,
  },
] as const;
