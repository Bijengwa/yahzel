import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { createNotification } from "../notifications/notification.service.js";
import { BLOCKED_REASON_LABELS, type BlockedReason } from "./obligation.types.js";
import {
  clearStallNotice,
  ensureWorkSettings,
  findStallNotice,
  upsertStallNotice,
} from "./obligation.repository.js";
import type { WorkAssignmentRecord, WorkItemRecord } from "./work.record.js";
import {
  listActiveAssignments,
  listOpenWorkItemsForOrganisation,
} from "./work.repository.js";
import { publicWorkItem } from "./work.service.js";

/**
 * A diagnostic reads a fact, never a verdict on a person: "this work has had
 * no recorded activity for N days," not "so-and-so is underperforming."
 * Nothing here computes a rating, a score, or a leaderboard — only the
 * inputs a human reviewer needs to decide what to do next.
 */
type StalledKind = "stalled_blocked" | "overdue" | "stalled_inactive";

function dayFloor(millis: number): number {
  return Math.max(0, Math.floor(millis / 86_400_000));
}

function diagnosticMessage(kind: StalledKind, inactivityDays: number): string {
  if (kind === "stalled_blocked") {
    return `This work has been blocked with no recorded activity for ${inactivityDays} day(s).`;
  }

  if (kind === "overdue") {
    return "This work is past its due date and has not been marked done.";
  }

  return `This work has had no recorded activity for ${inactivityDays} days.`;
}

function suggestedNextAction(kind: StalledKind, blockedReason: string | null): string {
  if (kind === "stalled_blocked") {
    const label = blockedReason
      ? (BLOCKED_REASON_LABELS[blockedReason as BlockedReason] ?? blockedReason)
      : "unspecified";

    return `Resolve the blocking reason (${label}) or reassign this work.`;
  }

  if (kind === "overdue") {
    return "Update the due date, or close this work out.";
  }

  return "Check in with the assignee, or reassign this work.";
}

function buildDiagnostic(
  item: WorkItemRecord,
  assignment: WorkAssignmentRecord | undefined,
  kind: StalledKind,
  inactivityDays: number,
  ageDays: number,
) {
  return {
    workItem: publicWorkItem(item),
    accountableProfileId: assignment?.assignee_profile_id ?? item.created_by,
    status: item.status,
    lastActivityAt: item.last_activity_at,
    dueAt: item.due_at,
    ageDays,
    inactivityDays,
    blockedReason: item.blocked_reason,
    kind,
    message: diagnosticMessage(kind, inactivityDays),
    suggestedNextAction: suggestedNextAction(kind, item.blocked_reason),
  };
}

export type StalledDiagnostic = ReturnType<typeof buildDiagnostic>;

/**
 * Recomputes stalled/blocked/overdue status for every open Work Item in an
 * organisation. A notification only goes out the moment an item newly
 * qualifies (or changes which way it is flagged) — re-running the scan
 * never re-notifies for the same standing condition, and an item that
 * recovers has its notice cleared so a later relapse is treated as new.
 */
async function computeAndSync(organisationId: number): Promise<StalledDiagnostic[]> {
  const settings = await ensureWorkSettings(organisationId);
  const candidates = await listOpenWorkItemsForOrganisation(organisationId);
  const activeByItem = await listActiveAssignments(candidates.map((item) => item.id));

  const now = Date.now();
  const results: StalledDiagnostic[] = [];

  for (const item of candidates) {
    const inactivityDays = dayFloor(now - new Date(item.last_activity_at).getTime());
    const ageDays = dayFloor(now - new Date(item.created_at).getTime());
    const isOverdue = item.due_at !== null && new Date(item.due_at).getTime() < now;
    const isStalledBlocked =
      item.status === "blocked" && inactivityDays >= settings.stalled_blocked_days;
    const isStalledInactive =
      item.status !== "blocked" && inactivityDays >= settings.stalled_inactive_days;

    let kind: StalledKind | null = null;

    if (isStalledBlocked) {
      kind = "stalled_blocked";
    } else if (isOverdue) {
      kind = "overdue";
    } else if (isStalledInactive) {
      kind = "stalled_inactive";
    }

    if (!kind) {
      await clearStallNotice(item.id);
      continue;
    }

    const assignment = activeByItem.get(item.id);
    const accountableProfileId = assignment?.assignee_profile_id ?? item.created_by;

    const previous = await findStallNotice(item.id);

    if (!previous || previous.kind !== kind) {
      await upsertStallNotice({ organisationId, workItemId: item.id, kind });

      await createNotification({
        recipientProfileId: accountableProfileId,
        type: "work.stalled",
        message: diagnosticMessage(kind, inactivityDays),
        organisationId,
        workItemId: item.id,
        actionUrl: `/work/${item.id}`,
      });
    }

    results.push(buildDiagnostic(item, assignment, kind, inactivityDays, ageDays));
  }

  return results;
}

export async function listStalledForOrganisation(
  userId: number,
  organisationId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const stalled = await computeAndSync(organisationId);

  return { stalled };
}

export async function runStalledScan(userId: number, organisationId: number) {
  await requireOccupancyCapability(userId, organisationId);

  const stalled = await computeAndSync(organisationId);

  return {
    message:
      stalled.length === 0
        ? "No stalled, blocked or overdue work was found."
        : `${stalled.length} item(s) flagged.`,
    stalled,
  };
}
