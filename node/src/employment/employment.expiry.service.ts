import {
  findMembership,
  findMembershipById,
  listMembers,
} from "../organisation/organisation.repository.js";
import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { findProfileById } from "../profile/profile.repository.js";
import { createLinkedWorkItem, publicWorkItem } from "../work/work.service.js";
import { validatePositiveId } from "../work/work.validation.js";
import { ensureBuiltInCapabilitiesSeeded } from "../work/work.capability.service.js";
import {
  attachWorkItemToExpiryNotice,
  ensureWorkSettings,
  findCapabilityByKey,
  findExpiryNotice,
  insertExpiryNoticeIfAbsent,
} from "../work/obligation.repository.js";
import { createNotification } from "../notifications/notification.service.js";
import { contractTypeLabel } from "./employment.types.js";
import type { ContractRecord, EmploymentRecordRecord } from "./employment.record.js";
import {
  findContractById,
  findEmploymentRecordById,
  listActiveContractsForOrganisation,
} from "./employment.repository.js";
import { EmploymentError, publicContract, publicEmploymentRecord } from "./employment.service.js";

/**
 * Which built-in capability each review action opens. Phase 3's contract
 * lifecycle already names these ideas (review / renew / extend / convert /
 * exit); this only chooses which Work template represents each one.
 */
const ACTION_CAPABILITY_KEY: Record<string, string> = {
  review: "contract_review",
  extend: "contract_extend",
  convert: "contract_convert",
  end: "contract_exit",
  renew: "contract_renewal",
};

function daysBetween(laterMillis: number, earlierMillis: number): number {
  return Math.ceil((laterMillis - earlierMillis) / 86_400_000);
}

async function memberDisplayName(
  organisationId: number,
  memberId: number,
): Promise<string> {
  const membership = await findMembershipById(organisationId, memberId);

  if (!membership) {
    return "Unknown";
  }

  const profile = membership.profile_id ? await findProfileById(membership.profile_id) : undefined;

  return profile?.full_name ?? membership.email ?? membership.title ?? "Unknown";
}

function publicExpiringContract(
  contract: ContractRecord,
  employmentRecord: EmploymentRecordRecord,
  memberName: string,
  daysUntilExpiry: number,
  notifiedAt: string | null,
  linkedWorkItemId: number | null,
) {
  return {
    contract: publicContract(contract),
    employmentRecord: publicEmploymentRecord(employmentRecord),
    memberId: employmentRecord.member_id,
    memberName,
    daysUntilExpiry,
    notifiedAt,
    linkedWorkItemId,
  };
}

export type PublicExpiringContract = ReturnType<typeof publicExpiringContract>;

/**
 * Finds every active, dated contract inside the organisation's notice
 * window, records a one-time notice for each new one (the unique index on
 * contract_id is what actually prevents a duplicate — this just avoids
 * re-notifying admins on every call), and returns the current list. History
 * is never touched: nothing here edits a contract or an employment record.
 */
async function computeAndSyncExpiry(
  organisationId: number,
): Promise<PublicExpiringContract[]> {
  const settings = await ensureWorkSettings(organisationId);
  const contracts = await listActiveContractsForOrganisation(organisationId);

  const now = Date.now();
  const noticeMillis = settings.contract_notice_days * 86_400_000;

  const members = await listMembers(organisationId);
  const admins = members.filter(
    (member) =>
      member.status === "active" &&
      member.system_role === "admin" &&
      member.profile_id !== null,
  );

  const results: PublicExpiringContract[] = [];

  for (const contract of contracts) {
    if (!contract.end_date) {
      continue;
    }

    const endMillis = new Date(contract.end_date).getTime();

    if (endMillis - now > noticeMillis) {
      continue;
    }

    const employmentRecord = await findEmploymentRecordById(
      contract.employment_record_id,
    );

    if (!employmentRecord) {
      continue;
    }

    const memberName = await memberDisplayName(organisationId, employmentRecord.member_id);
    const daysUntilExpiry = daysBetween(endMillis, now);

    let notice = await findExpiryNotice(contract.id);

    if (!notice) {
      notice = await insertExpiryNoticeIfAbsent({
        organisationId,
        contractId: contract.id,
      });

      if (notice) {
        const message =
          daysUntilExpiry >= 0
            ? `${memberName}'s ${contractTypeLabel(contract.contract_type)} contract ends in ${daysUntilExpiry} day(s) — review it.`
            : `${memberName}'s ${contractTypeLabel(contract.contract_type)} contract ended ${Math.abs(daysUntilExpiry)} day(s) ago and needs review.`;

        for (const admin of admins) {
          await createNotification({
            recipientProfileId: admin.profile_id!,
            type: "employment.contract.expiring",
            message,
            organisationId,
          });
        }
      } else {
        // Lost a race with a concurrent scan — read back what it wrote.
        notice = await findExpiryNotice(contract.id);
      }
    }

    results.push(
      publicExpiringContract(
        contract,
        employmentRecord,
        memberName,
        daysUntilExpiry,
        notice?.notified_at ?? null,
        notice?.work_item_id ?? null,
      ),
    );
  }

  return results;
}

export async function listExpiringContracts(userId: number, organisationId: number) {
  await requireOccupancyCapability(userId, organisationId);

  const expiring = await computeAndSyncExpiry(organisationId);

  return { expiring };
}

export async function scanContractExpiry(userId: number, organisationId: number) {
  await requireOccupancyCapability(userId, organisationId);

  const expiring = await computeAndSyncExpiry(organisationId);

  return {
    message:
      expiring.length === 0
        ? "No contracts are approaching expiry."
        : `${expiring.length} contract(s) need review.`,
    expiring,
  };
}

/* ------------------------------------------------------------------------
   Linked Work — the actual obligation a person acts on. Reuses the exact
   same Work engine as every other Phase 4 generator: no e-signature, no
   renewal automation, no rewriting of the contract itself.
   --------------------------------------------------------------------- */

export type CreateReviewWorkInput = {
  action?: unknown;
  assigneeProfileId?: unknown;
};

export async function createReviewWorkForContract(
  userId: number,
  organisationId: number,
  contractId: number,
  input: CreateReviewWorkInput,
) {
  await requireOccupancyCapability(userId, organisationId);

  const contract = await findContractById(contractId);

  if (!contract || contract.organisation_id !== organisationId) {
    throw EmploymentError.field(404, "form", "That contract could not be found.");
  }

  const employmentRecord = await findEmploymentRecordById(
    contract.employment_record_id,
  );

  if (!employmentRecord || employmentRecord.organisation_id !== organisationId) {
    throw EmploymentError.field(
      404,
      "form",
      "That employment record could not be found.",
    );
  }

  const action =
    typeof input.action === "string" && input.action in ACTION_CAPABILITY_KEY
      ? input.action
      : "review";

  const capabilityKey = ACTION_CAPABILITY_KEY[action]!;

  await ensureBuiltInCapabilitiesSeeded(organisationId);

  const capability = await findCapabilityByKey(organisationId, capabilityKey);

  if (!capability) {
    throw EmploymentError.field(500, "form", "That review action is not available.");
  }

  let assigneeProfileId = userId;

  if (input.assigneeProfileId !== undefined && input.assigneeProfileId !== null) {
    const parsed = validatePositiveId(input.assigneeProfileId, "assigneeProfileId");

    if (!parsed.ok) {
      throw new EmploymentError(422, parsed.errors);
    }

    const membership = await findMembership(organisationId, parsed.value);

    if (!membership || membership.status !== "active") {
      throw EmploymentError.field(
        422,
        "assigneeProfileId",
        "That person is not an active member of this organisation.",
      );
    }

    assigneeProfileId = parsed.value;
  }

  const { workItem } = await createLinkedWorkItem({
    organisationId,
    title: capability.suggested_title,
    description: capability.suggested_description,
    expectedOutput: capability.suggested_expected_output,
    dueAt: null,
    createdBy: userId,
    assigneeProfileId,
    sourceCapabilityId: capability.id,
    contractId: contract.id,
    employmentRecordId: employmentRecord.id,
  });

  // Links this Work Item back to the notice that prompted it, if one
  // exists — a no-op update when the admin acted before any scan ran.
  await attachWorkItemToExpiryNotice(contract.id, workItem.id);

  return {
    message: `${workItem.title} has been created.`,
    workItem: publicWorkItem(workItem),
  };
}
