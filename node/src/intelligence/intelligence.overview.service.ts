import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { listMembers } from "../organisation/organisation.repository.js";
import { listPositions } from "../hierarchy/hierarchy.repository.js";
import { listActiveOccupancies } from "../hierarchy/occupancy.repository.js";
import { ensureWorkSettings } from "../work/obligation.repository.js";
import { listWorkItemsForOrganisation } from "../work/work.repository.js";
import { classifyWorkItem } from "../work/work.stalled.service.js";
import { listOutcomesForOrganisation, listProjects } from "../projects/project.repository.js";
import { listActiveSignals, listAllSignals } from "./intelligence.repository.js";
import { scanOrganisationSignals } from "./intelligence.signal.service.js";
import { SIGNAL_TYPES, type SignalType } from "./intelligence.record.js";

const APPROACHING_OUTCOME_DAYS = 14;

function isOpenWork(status: string): boolean {
  return status !== "done" && status !== "cancelled";
}

export async function getOrganisationOverview(userId: number, organisationId: number) {
  await requireOccupancyCapability(userId, organisationId);

  await scanOrganisationSignals(organisationId);

  const [members, positions, occupancies, settings, workItems, projects, outcomes, activeSignals] =
    await Promise.all([
      listMembers(organisationId),
      listPositions(organisationId),
      listActiveOccupancies(organisationId),
      ensureWorkSettings(organisationId),
      listWorkItemsForOrganisation(organisationId),
      listProjects(organisationId),
      listOutcomesForOrganisation(organisationId),
      listActiveSignals(organisationId),
    ]);

  /* ---- People ---- */
  const activeMembers = members.filter((member) => member.status === "active");
  const occupiedPositionIds = new Set(occupancies.map((row) => row.position_id));

  const people = {
    activeMembers: activeMembers.length,
    occupiedPositions: occupiedPositionIds.size,
    vacantPositions: positions.length - occupiedPositionIds.size,
  };

  /* ---- Work ---- */
  const now = Date.now();
  let openWork = 0;
  let completedWork = 0;
  let overdueWork = 0;
  let blockedWork = 0;
  let stalledWork = 0;

  for (const item of workItems) {
    if (item.status === "done") {
      completedWork += 1;
    }

    if (isOpenWork(item.status)) {
      openWork += 1;

      if (item.status === "blocked") {
        blockedWork += 1;
      }

      if (item.due_at !== null && new Date(item.due_at).getTime() < now) {
        overdueWork += 1;
      }

      const kind = classifyWorkItem(item, settings, now);

      if (kind === "stalled_blocked" || kind === "stalled_inactive") {
        stalledWork += 1;
      }
    }
  }

  const work = { total: workItems.length, open: openWork, completed: completedWork, overdue: overdueWork, blocked: blockedWork, stalled: stalledWork };

  /* ---- Projects ---- */
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const pausedProjects = projects.filter((p) => p.status === "paused").length;
  const completedProjects = projects.filter((p) => p.status === "completed").length;

  const projectsWithSignal = new Set(
    activeSignals
      .filter((s) => s.entity_type === "project")
      .map((s) => s.entity_id),
  );

  // An outcome signal points at the outcome, not its parent project — the
  // signal row does not carry a project id. "Projects requiring attention"
  // therefore counts direct project.* signals only (a conservative,
  // easy-to-explain count) rather than tracing outcome signals back to a
  // parent project.
  const projectsSummary = {
    active: activeProjects,
    paused: pausedProjects,
    completed: completedProjects,
    requiringAttention: projectsWithSignal.size,
  };

  /* ---- Outcomes ---- */
  const outcomesTotal = outcomes.length;
  const outcomesCompleted = outcomes.filter((o) => o.status === "done").length;
  const outcomesOpen = outcomesTotal - outcomesCompleted;
  let outcomesOverdue = 0;
  let outcomesApproaching = 0;

  for (const outcome of outcomes) {
    if (outcome.status === "done" || outcome.target_date === null) {
      continue;
    }

    const targetMillis = new Date(outcome.target_date).getTime();

    if (targetMillis < now) {
      outcomesOverdue += 1;
    } else if (targetMillis - now <= APPROACHING_OUTCOME_DAYS * 86_400_000) {
      outcomesApproaching += 1;
    }
  }

  const outcomesSummary = {
    total: outcomesTotal,
    open: outcomesOpen,
    completed: outcomesCompleted,
    overdue: outcomesOverdue,
    approachingTarget: outcomesApproaching,
  };

  /* ---- Attention ---- */
  const allSignals = await listAllSignals(organisationId);
  const byType: Record<SignalType, number> = Object.fromEntries(
    SIGNAL_TYPES.map((type) => [type, 0]),
  ) as Record<SignalType, number>;

  for (const signal of allSignals) {
    if (signal.status === "active" && signal.type in byType) {
      byType[signal.type as SignalType] += 1;
    }
  }

  const attention = { active: activeSignals.length, byType };

  return { people, work, projects: projectsSummary, outcomes: outcomesSummary, attention };
}
