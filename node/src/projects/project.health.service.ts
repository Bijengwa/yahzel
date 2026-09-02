import { ensureWorkSettings } from "../work/obligation.repository.js";
import { classifyWorkItem } from "../work/work.stalled.service.js";
import { listWorkItemsForProject } from "../work/work.repository.js";
import type { WorkItemRecord } from "../work/work.record.js";
import type { ProjectOutcomeRecord, ProjectRecord } from "./project.record.js";

/**
 * A derived, read-only view of a Project's state — factual counts and
 * sentences, exactly the shape work.stalled.service already uses for
 * individual Work Items. Nothing here computes a rating, a score or a
 * leaderboard: it describes the Project, never the people on it.
 *
 * Deliberately side-effect free: unlike runStalledScan, loading a Project's
 * health never writes a stall notice or sends a notification. It reuses
 * classifyWorkItem (work.stalled.service's own rule) so "stalled" here can
 * never quietly drift from what the stalled-work scan itself would say.
 */
export type ProjectHealth = {
  totalWork: number;
  openWork: number;
  completedWork: number;
  overdueWork: number;
  blockedWork: number;
  stalledWork: number;

  outcomesTotal: number;
  outcomesDone: number;
  outcomesOverdue: number;

  /** Project's own target date, not yet reached, within the notice window. */
  approachingTargetDate: boolean;

  /** Days since the most recent activity across the Project's Work, if any. */
  daysSinceLastActivity: number | null;

  /** Short, factual sentences — "3 items are overdue.", never a verdict. */
  signals: string[];
};

const APPROACHING_TARGET_DAYS = 14;
const INACTIVE_PROJECT_DAYS = 8;

function isOpen(item: WorkItemRecord): boolean {
  return item.status !== "done" && item.status !== "cancelled";
}

export async function computeProjectHealth(
  project: ProjectRecord,
  outcomes: ProjectOutcomeRecord[],
): Promise<ProjectHealth> {
  const [settings, workItems] = await Promise.all([
    ensureWorkSettings(project.organisation_id),
    listWorkItemsForProject(project.id),
  ]);

  const now = Date.now();

  let openWork = 0;
  let completedWork = 0;
  let overdueWork = 0;
  let blockedWork = 0;
  let stalledWork = 0;
  let latestActivityMillis: number | null = null;

  for (const item of workItems) {
    if (item.status === "done") {
      completedWork += 1;
    }

    if (isOpen(item)) {
      openWork += 1;

      if (item.status === "blocked") {
        blockedWork += 1;
      }

      if (item.due_at !== null && new Date(item.due_at).getTime() < now) {
        overdueWork += 1;
      }

      // "stalled" is its own signal, distinct from "overdue" (counted above):
      // blocked-too-long or inactive-too-long, never a plain overdue item
      // that is otherwise moving.
      const kind = classifyWorkItem(item, settings, now);

      if (kind === "stalled_blocked" || kind === "stalled_inactive") {
        stalledWork += 1;
      }
    }

    const activityMillis = new Date(item.last_activity_at).getTime();

    if (latestActivityMillis === null || activityMillis > latestActivityMillis) {
      latestActivityMillis = activityMillis;
    }
  }

  const outcomesDone = outcomes.filter((o) => o.status === "done").length;
  const outcomesOverdue = outcomes.filter(
    (o) =>
      o.status !== "done" &&
      o.target_date !== null &&
      new Date(o.target_date).getTime() < now,
  ).length;

  const approachingTargetDate =
    project.status === "active" &&
    project.target_end_date !== null &&
    new Date(project.target_end_date).getTime() > now &&
    new Date(project.target_end_date).getTime() - now <=
      APPROACHING_TARGET_DAYS * 86_400_000;

  const daysSinceLastActivity =
    latestActivityMillis === null
      ? null
      : Math.max(0, Math.floor((now - latestActivityMillis) / 86_400_000));

  const signals: string[] = [];

  if (overdueWork > 0) {
    signals.push(
      overdueWork === 1
        ? "1 item is overdue."
        : `${overdueWork} items are overdue.`,
    );
  }

  if (blockedWork > 0) {
    signals.push(
      blockedWork === 1
        ? "1 item is blocked."
        : `${blockedWork} items are blocked.`,
    );
  }

  if (stalledWork > 0) {
    signals.push(
      stalledWork === 1
        ? "1 item has had no recorded activity for a while."
        : `${stalledWork} items have had no recorded activity for a while.`,
    );
  }

  if (outcomesOverdue > 0) {
    signals.push(
      outcomesOverdue === 1
        ? "1 outcome is past its target date."
        : `${outcomesOverdue} outcomes are past their target date.`,
    );
  }

  if (approachingTargetDate) {
    signals.push("The Project's target date is approaching.");
  }

  if (
    daysSinceLastActivity !== null &&
    daysSinceLastActivity >= INACTIVE_PROJECT_DAYS &&
    project.status === "active"
  ) {
    signals.push(`No recorded activity in ${daysSinceLastActivity} days.`);
  }

  if (signals.length === 0) {
    signals.push("No issues detected.");
  }

  return {
    totalWork: workItems.length,
    openWork,
    completedWork,
    overdueWork,
    blockedWork,
    stalledWork,
    outcomesTotal: outcomes.length,
    outcomesDone,
    outcomesOverdue,
    approachingTargetDate,
    daysSinceLastActivity,
    signals,
  };
}
