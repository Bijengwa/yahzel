import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { findMembership } from "../organisation/organisation.repository.js";
import { createNotification } from "../notifications/notification.service.js";
import type { WorkScheduleRecord } from "./obligation.record.js";
import { isCadence, type Cadence } from "./obligation.types.js";
import {
  findCapabilityById,
  findOccurrence,
  insertOccurrenceIfAbsent,
  insertSchedule,
  listDueSchedules,
  listSchedules,
  updateSchedule,
} from "./obligation.repository.js";
import { validateOptionalCadence, type FieldError } from "./obligation.validation.js";
import { validatePositiveId } from "./work.validation.js";
import { WorkError, createLinkedWorkItem, publicWorkItem } from "./work.service.js";

/* ------------------------------------------------------------------------
   Cadence arithmetic — deliberately plain Date math over a date-only
   (YYYY-MM-DD) string, so a schedule's own clock never drifts with the
   timezone of whichever request happens to trigger generation.
   --------------------------------------------------------------------- */

function toUtcDate(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO-8601 week number, e.g. "2026-W36". */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of the same ISO week decides which year the week belongs to.
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quarterKey(date: Date): string {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function yearKey(date: Date): string {
  return `${date.getUTCFullYear()}`;
}

/** The occurrence's period identity — the same period always yields the same key. */
export function occurrenceKeyFor(cadence: string, dateOnly: string): string {
  const date = toUtcDate(dateOnly);

  switch (cadence) {
    case "weekly":
      return isoWeekKey(date);
    case "monthly":
      return monthKey(date);
    case "quarterly":
      return quarterKey(date);
    case "yearly":
      return yearKey(date);
    default:
      return monthKey(date);
  }
}

/** The next run date after this one, per cadence. */
function advanceCadence(dateOnly: string, cadence: string): string {
  const date = toUtcDate(dateOnly);

  switch (cadence) {
    case "weekly":
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case "quarterly":
      date.setUTCMonth(date.getUTCMonth() + 3);
      break;
    case "yearly":
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
    case "monthly":
    default:
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
  }

  return toDateOnly(date);
}

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

function publicSchedule(record: WorkScheduleRecord) {
  return {
    id: record.id,
    organisationId: record.organisation_id,
    capabilityId: record.capability_id,
    cadence: record.cadence,
    nextRunOn: record.next_run_on,
    lastGeneratedOn: record.last_generated_on,
    assigneeProfileId: record.assignee_profile_id,
    active: record.active,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

/* ------------------------------------------------------------------------
   Read / create — admin-only, the same standing organisation-wide
   configuration (departments, occupancy, employment) already requires.
   --------------------------------------------------------------------- */

export async function listSchedulesForOrganisation(
  userId: number,
  organisationId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const schedules = await listSchedules(organisationId);

  return { schedules: schedules.map(publicSchedule) };
}

export type CreateScheduleInput = {
  organisationId?: unknown;
  capabilityId?: unknown;
  cadence?: unknown;
  nextRunOn?: unknown;
  assigneeProfileId?: unknown;
};

export async function createSchedule(userId: number, input: CreateScheduleInput) {
  const organisationId = validatePositiveId(input.organisationId, "organisationId");

  if (!organisationId.ok) {
    throw new WorkError(422, organisationId.errors);
  }

  await requireOccupancyCapability(userId, organisationId.value);

  const capabilityId = validatePositiveId(input.capabilityId, "capabilityId");
  const assigneeProfileId = validatePositiveId(
    input.assigneeProfileId,
    "assigneeProfileId",
  );
  const cadenceInput = validateOptionalCadence(input.cadence);

  const errors: FieldError[] = [capabilityId, assigneeProfileId, cadenceInput].flatMap(
    (result) => (result.ok ? [] : result.errors),
  );

  if (!capabilityId.ok || !assigneeProfileId.ok || !cadenceInput.ok) {
    throw new WorkError(422, errors);
  }

  const capability = await findCapabilityById(capabilityId.value);

  if (!capability || capability.organisation_id !== organisationId.value) {
    throw WorkError.field(
      422,
      "capabilityId",
      "That capability could not be found in this organisation.",
    );
  }

  if (!capability.active) {
    throw WorkError.field(422, "capabilityId", "This capability is not active.");
  }

  const cadence: Cadence | null = cadenceInput.value ?? (isCadence(capability.cadence ?? "")
    ? (capability.cadence as Cadence)
    : null);

  if (!cadence) {
    throw WorkError.field(
      422,
      "cadence",
      "This capability has no cadence — choose one for this schedule.",
    );
  }

  const membership = await findMembership(organisationId.value, assigneeProfileId.value);

  if (!membership || membership.status !== "active") {
    throw WorkError.field(
      422,
      "assigneeProfileId",
      "That person is not an active member of this organisation.",
    );
  }

  const nextRunOnRaw = String(input.nextRunOn ?? "").trim();
  const nextRunOnDate = nextRunOnRaw ? new Date(nextRunOnRaw) : new Date();

  if (Number.isNaN(nextRunOnDate.getTime())) {
    throw WorkError.field(422, "nextRunOn", "Enter a valid date.");
  }

  const created = await insertSchedule({
    organisationId: organisationId.value,
    capabilityId: capability.id,
    cadence,
    nextRunOn: toDateOnly(nextRunOnDate),
    assigneeProfileId: assigneeProfileId.value,
  });

  return {
    message: "The recurring schedule has been created.",
    schedule: publicSchedule(created),
  };
}

/* ------------------------------------------------------------------------
   Generate — a schedule due to run creates a NORMAL Work Item and its own
   occurrence row. Never a workflow engine: this is the same createLinkedWorkItem
   door every other Phase 4 generator uses.
   --------------------------------------------------------------------- */

const MAX_CATCH_UP_OCCURRENCES = 24;

export async function generateDueOccurrences(
  organisationId: number,
  generatedBy: number,
) {
  const today = toDateOnly(new Date());
  const due = await listDueSchedules(organisationId, today);

  const generated: ReturnType<typeof publicWorkItem>[] = [];

  for (const schedule of due) {
    const capability = await findCapabilityById(schedule.capability_id);

    if (!capability || !capability.active) {
      // The capability behind this schedule was deactivated — leave the
      // schedule alone rather than generating from a retired definition.
      continue;
    }

    let cursor = schedule.next_run_on;
    let iterations = 0;

    while (cursor <= today && iterations < MAX_CATCH_UP_OCCURRENCES) {
      iterations += 1;

      const occurrenceKey = occurrenceKeyFor(schedule.cadence, cursor);
      const existing = await findOccurrence(schedule.id, occurrenceKey);

      if (!existing) {
        const assigneeProfileId = schedule.assignee_profile_id ?? generatedBy;

        const { workItem } = await createLinkedWorkItem({
          organisationId,
          title: capability.suggested_title,
          description: capability.suggested_description,
          expectedOutput: capability.suggested_expected_output,
          dueAt: null,
          createdBy: generatedBy,
          assigneeProfileId,
          sourceCapabilityId: capability.id,
          sourceScheduleId: schedule.id,
          occurrenceKey,
        });

        const occurrence = await insertOccurrenceIfAbsent({
          organisationId,
          scheduleId: schedule.id,
          occurrenceKey,
          workItemId: workItem.id,
        });

        // The row was already there (a concurrent call won the race) — the
        // Work Item this call created is an orphan duplicate; nothing else
        // references it yet, so it is safe to leave as-is rather than risk
        // deleting someone else's freshly created item.
        if (occurrence) {
          await createNotification({
            recipientProfileId: assigneeProfileId,
            type: "work.recurring.generated",
            message: `Recurring Work "${workItem.title}" has been generated.`,
            organisationId,
            workItemId: workItem.id,
            actionUrl: `/work/${workItem.id}`,
          });

          generated.push(publicWorkItem(workItem));
        }
      }

      cursor = advanceCadence(cursor, schedule.cadence);
    }

    await updateSchedule(schedule.id, {
      next_run_on: cursor,
      last_generated_on: today,
    });
  }

  return generated;
}

export async function generateSchedulesForOrganisation(
  userId: number,
  organisationId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const generated = await generateDueOccurrences(organisationId, userId);

  return {
    message:
      generated.length === 0
        ? "No schedules were due."
        : `${generated.length} Work item(s) generated.`,
    workItems: generated,
  };
}
