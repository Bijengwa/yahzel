import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { BUILT_IN_CAPABILITIES } from "./obligation.types.js";
import type { WorkCapabilityRecord, WorkSettingsRecord } from "./obligation.record.js";
import {
  ensureWorkSettings,
  findCapabilityById,
  findCapabilityByKey,
  insertCapability,
  listCapabilities,
  seedBuiltInCapabilities,
  updateCapability,
  updateWorkSettings,
} from "./obligation.repository.js";
import {
  validateAssigneeRule,
  validateCapabilityDescription,
  validateCapabilityName,
  validateChecklist,
  validateDayThreshold,
  validateEvidenceExpectation,
  validateOptionalCadence,
  validateSuggestedDescription,
  validateSuggestedExpectedOutput,
  validateSuggestedTitle,
  type FieldError,
} from "./obligation.validation.js";
import {
  validateDueAt,
  validateOptionalPositiveId,
  validatePositiveId,
} from "./work.validation.js";
import {
  WorkError,
  createLinkedWorkItem,
  publicAssignment,
  publicWorkItem,
  requireOrganisationMembership,
} from "./work.service.js";
import { findMembership } from "../organisation/organisation.repository.js";

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

function publicSettings(record: WorkSettingsRecord) {
  return {
    organisationId: record.organisation_id,
    contractNoticeDays: record.contract_notice_days,
    stalledInactiveDays: record.stalled_inactive_days,
    stalledBlockedDays: record.stalled_blocked_days,
    updatedAt: record.updated_at,
  };
}

function publicCapability(record: WorkCapabilityRecord) {
  return {
    id: record.id,
    organisationId: record.organisation_id,
    key: record.key,
    name: record.name,
    description: record.description,
    suggestedTitle: record.suggested_title,
    suggestedDescription: record.suggested_description,
    suggestedExpectedOutput: record.suggested_expected_output,
    checklist: record.checklist_json
      ? (JSON.parse(record.checklist_json) as string[])
      : null,
    defaultAssigneeRule: record.default_assignee_rule,
    cadence: record.cadence,
    evidenceExpectation: record.evidence_expectation,
    builtIn: record.built_in,
    active: record.active,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

/* ------------------------------------------------------------------------
   Settings — the three thresholds an organisation may tune. Admin-only, the
   same standing department/occupancy configuration already requires.
   --------------------------------------------------------------------- */

export async function getWorkSettings(userId: number, organisationId: number) {
  await requireOccupancyCapability(userId, organisationId);

  const settings = await ensureWorkSettings(organisationId);

  return { settings: publicSettings(settings) };
}

export type UpdateSettingsInput = {
  contractNoticeDays?: unknown;
  stalledInactiveDays?: unknown;
  stalledBlockedDays?: unknown;
};

export async function updateWorkSettingsForOrganisation(
  userId: number,
  organisationId: number,
  input: UpdateSettingsInput,
) {
  await requireOccupancyCapability(userId, organisationId);

  const existing = await ensureWorkSettings(organisationId);

  const contractNoticeDays =
    input.contractNoticeDays === undefined
      ? { ok: true as const, value: existing.contract_notice_days }
      : validateDayThreshold(input.contractNoticeDays, "contractNoticeDays");

  const stalledInactiveDays =
    input.stalledInactiveDays === undefined
      ? { ok: true as const, value: existing.stalled_inactive_days }
      : validateDayThreshold(input.stalledInactiveDays, "stalledInactiveDays");

  const stalledBlockedDays =
    input.stalledBlockedDays === undefined
      ? { ok: true as const, value: existing.stalled_blocked_days }
      : validateDayThreshold(input.stalledBlockedDays, "stalledBlockedDays");

  const errors: FieldError[] = [
    contractNoticeDays,
    stalledInactiveDays,
    stalledBlockedDays,
  ].flatMap((result) => (result.ok ? [] : result.errors));

  if (!contractNoticeDays.ok || !stalledInactiveDays.ok || !stalledBlockedDays.ok) {
    throw new WorkError(422, errors);
  }

  const updated = await updateWorkSettings(organisationId, {
    contract_notice_days: contractNoticeDays.value,
    stalled_inactive_days: stalledInactiveDays.value,
    stalled_blocked_days: stalledBlockedDays.value,
  });

  return {
    message: "Work settings have been updated.",
    settings: publicSettings(updated),
  };
}

/* ------------------------------------------------------------------------
   Capabilities — organisation-scoped templates that create ordinary Work.
   Listing/using is open to any active member, the same standing
   createWorkItem already grants; defining/customising is admin-only, the
   same standing department/occupancy configuration already requires.
   --------------------------------------------------------------------- */

function slugifyKey(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  return slug || "capability";
}

async function uniqueKeyFor(organisationId: number, name: string): Promise<string> {
  const base = slugifyKey(name);
  let candidate = base;
  let suffix = 2;

  while (await findCapabilityByKey(organisationId, candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

/** Idempotent — safe to call from any Phase 4 entry point that needs a built-in by key. */
export async function ensureBuiltInCapabilitiesSeeded(
  organisationId: number,
): Promise<void> {
  await seedBuiltInCapabilities(
    organisationId,
    BUILT_IN_CAPABILITIES.map((capability) => ({
      key: capability.key,
      name: capability.name,
      description: capability.description,
      suggestedTitle: capability.suggestedTitle,
      suggestedDescription: capability.suggestedDescription,
      suggestedExpectedOutput: capability.suggestedExpectedOutput,
      evidenceExpectation: capability.evidenceExpectation,
      defaultAssigneeRule: capability.defaultAssigneeRule,
      cadence: capability.cadence,
    })),
  );
}

export async function listCapabilitiesForOrganisation(
  userId: number,
  organisationId: number,
) {
  await requireOrganisationMembership(userId, organisationId);

  await ensureBuiltInCapabilitiesSeeded(organisationId);

  const capabilities = await listCapabilities(organisationId);

  return { capabilities: capabilities.map(publicCapability) };
}

export type CreateCapabilityInput = {
  organisationId?: unknown;
  name?: unknown;
  description?: unknown;
  suggestedTitle?: unknown;
  suggestedDescription?: unknown;
  suggestedExpectedOutput?: unknown;
  evidenceExpectation?: unknown;
  checklist?: unknown;
  defaultAssigneeRule?: unknown;
  cadence?: unknown;
};

export async function createCapability(userId: number, input: CreateCapabilityInput) {
  const organisationId = validatePositiveId(input.organisationId, "organisationId");

  if (!organisationId.ok) {
    throw new WorkError(422, organisationId.errors);
  }

  await requireOccupancyCapability(userId, organisationId.value);

  const name = validateCapabilityName(input.name);
  const description = validateCapabilityDescription(input.description);
  const suggestedTitle = validateSuggestedTitle(input.suggestedTitle);
  const suggestedDescription = validateSuggestedDescription(input.suggestedDescription);
  const suggestedExpectedOutput = validateSuggestedExpectedOutput(
    input.suggestedExpectedOutput,
  );
  const evidenceExpectation = validateEvidenceExpectation(input.evidenceExpectation);
  const checklist = validateChecklist(input.checklist);
  const defaultAssigneeRule = validateAssigneeRule(input.defaultAssigneeRule);
  const cadence = validateOptionalCadence(input.cadence);

  const errors: FieldError[] = [
    name,
    description,
    suggestedTitle,
    suggestedDescription,
    suggestedExpectedOutput,
    evidenceExpectation,
    checklist,
    defaultAssigneeRule,
    cadence,
  ].flatMap((result) => (result.ok ? [] : result.errors));

  if (
    !name.ok ||
    !description.ok ||
    !suggestedTitle.ok ||
    !suggestedDescription.ok ||
    !suggestedExpectedOutput.ok ||
    !evidenceExpectation.ok ||
    !checklist.ok ||
    !defaultAssigneeRule.ok ||
    !cadence.ok
  ) {
    throw new WorkError(422, errors);
  }

  const key = await uniqueKeyFor(organisationId.value, name.value);

  const created = await insertCapability({
    organisationId: organisationId.value,
    key,
    name: name.value,
    description: description.value,
    suggestedTitle: suggestedTitle.value,
    suggestedDescription: suggestedDescription.value,
    suggestedExpectedOutput: suggestedExpectedOutput.value,
    checklistJson: checklist.value,
    defaultAssigneeRule: defaultAssigneeRule.value,
    cadence: cadence.value,
    evidenceExpectation: evidenceExpectation.value,
    builtIn: false,
  });

  return {
    message: `${created.name} has been created.`,
    capability: publicCapability(created),
  };
}

async function requireCapability(capabilityId: number): Promise<WorkCapabilityRecord> {
  const capability = await findCapabilityById(capabilityId);

  if (!capability) {
    throw WorkError.field(404, "form", "That capability could not be found.");
  }

  return capability;
}

export type UpdateCapabilityInput = {
  name?: unknown;
  description?: unknown;
  suggestedTitle?: unknown;
  suggestedDescription?: unknown;
  suggestedExpectedOutput?: unknown;
  evidenceExpectation?: unknown;
  checklist?: unknown;
  defaultAssigneeRule?: unknown;
  cadence?: unknown;
  active?: unknown;
};

/**
 * Every field — including a built-in's suggested wording, assignee rule and
 * cadence — may be customised by an admin. The `key` and `builtIn` flag
 * never change: they are the capability's identity, not its configuration.
 * This is how "customise the built-in without an immutable workflow" is
 * satisfied without a second definition table.
 */
export async function updateCapabilityDetails(
  userId: number,
  capabilityId: number,
  input: UpdateCapabilityInput,
) {
  const existing = await requireCapability(capabilityId);

  await requireOccupancyCapability(userId, existing.organisation_id);

  const name =
    input.name === undefined
      ? { ok: true as const, value: existing.name }
      : validateCapabilityName(input.name);

  const description =
    input.description === undefined
      ? { ok: true as const, value: existing.description }
      : validateCapabilityDescription(input.description);

  const suggestedTitle =
    input.suggestedTitle === undefined
      ? { ok: true as const, value: existing.suggested_title }
      : validateSuggestedTitle(input.suggestedTitle);

  const suggestedDescription =
    input.suggestedDescription === undefined
      ? { ok: true as const, value: existing.suggested_description }
      : validateSuggestedDescription(input.suggestedDescription);

  const suggestedExpectedOutput =
    input.suggestedExpectedOutput === undefined
      ? { ok: true as const, value: existing.suggested_expected_output }
      : validateSuggestedExpectedOutput(input.suggestedExpectedOutput);

  const evidenceExpectation =
    input.evidenceExpectation === undefined
      ? { ok: true as const, value: existing.evidence_expectation }
      : validateEvidenceExpectation(input.evidenceExpectation);

  const checklist =
    input.checklist === undefined
      ? { ok: true as const, value: existing.checklist_json }
      : validateChecklist(input.checklist);

  const defaultAssigneeRule =
    input.defaultAssigneeRule === undefined
      ? { ok: true as const, value: existing.default_assignee_rule }
      : validateAssigneeRule(input.defaultAssigneeRule);

  const cadence =
    input.cadence === undefined
      ? { ok: true as const, value: existing.cadence }
      : validateOptionalCadence(input.cadence);

  const errors: FieldError[] = [
    name,
    description,
    suggestedTitle,
    suggestedDescription,
    suggestedExpectedOutput,
    evidenceExpectation,
    checklist,
    defaultAssigneeRule,
    cadence,
  ].flatMap((result) => (result.ok ? [] : result.errors));

  if (
    !name.ok ||
    !description.ok ||
    !suggestedTitle.ok ||
    !suggestedDescription.ok ||
    !suggestedExpectedOutput.ok ||
    !evidenceExpectation.ok ||
    !checklist.ok ||
    !defaultAssigneeRule.ok ||
    !cadence.ok
  ) {
    throw new WorkError(422, errors);
  }

  const active = input.active === undefined ? existing.active : Boolean(input.active);

  const updated = await updateCapability(existing.id, {
    name: name.value,
    description: description.value,
    suggested_title: suggestedTitle.value,
    suggested_description: suggestedDescription.value,
    suggested_expected_output: suggestedExpectedOutput.value,
    checklist_json: checklist.value,
    default_assignee_rule: defaultAssigneeRule.value,
    cadence: cadence.value,
    evidence_expectation: evidenceExpectation.value,
    active,
  });

  return {
    message: "The capability has been updated.",
    capability: publicCapability(updated),
  };
}

/* ------------------------------------------------------------------------
   Instantiate — the one path from a capability to a NORMAL Work Item. It
   calls the exact same Work creation used everywhere else, so the result
   is assigned, reported on, reviewed and accepted like any other Work.
   --------------------------------------------------------------------- */

export type InstantiateCapabilityInput = {
  title?: unknown;
  description?: unknown;
  expectedOutput?: unknown;
  dueAt?: unknown;
  assigneeProfileId?: unknown;
  departmentId?: unknown;
};

export async function instantiateCapability(
  userId: number,
  capabilityId: number,
  input: InstantiateCapabilityInput,
) {
  const capability = await requireCapability(capabilityId);

  if (!capability.active) {
    throw WorkError.field(422, "form", "This capability is not active.");
  }

  await requireOrganisationMembership(userId, capability.organisation_id);

  const title =
    input.title === undefined || input.title === ""
      ? { ok: true as const, value: capability.suggested_title }
      : (() => {
          const value = String(input.title).trim().slice(0, 200);
          return value
            ? { ok: true as const, value }
            : { ok: true as const, value: capability.suggested_title };
        })();

  const description =
    input.description === undefined
      ? { ok: true as const, value: capability.suggested_description }
      : { ok: true as const, value: String(input.description ?? "").trim() || null };

  const expectedOutput =
    input.expectedOutput === undefined
      ? { ok: true as const, value: capability.suggested_expected_output }
      : { ok: true as const, value: String(input.expectedOutput ?? "").trim() || null };

  const dueAt = validateDueAt(input.dueAt);

  if (!dueAt.ok) {
    throw new WorkError(422, dueAt.errors);
  }

  const departmentId = validateOptionalPositiveId(input.departmentId, "departmentId");

  if (!departmentId.ok) {
    throw new WorkError(422, departmentId.errors);
  }

  // "caller" defaults to whoever is instantiating; "admin" has no single
  // answer, so the caller must name an eligible active member and that
  // member is checked exactly like any other Work assignment.
  let assigneeProfileId = userId;

  if (input.assigneeProfileId !== undefined && input.assigneeProfileId !== null) {
    const parsed = validatePositiveId(input.assigneeProfileId, "assigneeProfileId");

    if (!parsed.ok) {
      throw new WorkError(422, parsed.errors);
    }

    assigneeProfileId = parsed.value;
  } else if (capability.default_assignee_rule === "admin") {
    throw WorkError.field(
      422,
      "assigneeProfileId",
      "This capability assigns to an admin — choose who.",
    );
  }

  const membership = await findMembership(capability.organisation_id, assigneeProfileId);

  if (!membership || membership.status !== "active") {
    throw WorkError.field(
      422,
      "assigneeProfileId",
      "That person is not an active member of this organisation.",
    );
  }

  const { workItem, assignment } = await createLinkedWorkItem({
    organisationId: capability.organisation_id,
    title: title.value,
    description: description.value,
    expectedOutput: expectedOutput.value,
    dueAt: dueAt.value,
    departmentId: departmentId.value,
    createdBy: userId,
    assigneeProfileId,
    sourceCapabilityId: capability.id,
  });

  return {
    message: `${workItem.title} has been created.`,
    workItem: publicWorkItem(workItem),
    assignment: publicAssignment(assignment),
  };
}
