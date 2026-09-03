import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { listMembers } from "../organisation/organisation.repository.js";
import { listPositions } from "../hierarchy/hierarchy.repository.js";
import { listOccupancyHistoryForOrganisation } from "../hierarchy/occupancy.repository.js";
import { listDepartmentSummaries } from "../departments/department.repository.js";
import {
  listAttachmentsForOrganisation,
  listReportsForOrganisation,
  listWorkItemsForOrganisation,
} from "../work/work.repository.js";
import { listProjectEventsForOrganisation } from "../projects/project.repository.js";
import {
  listContractsForOrganisation,
  listEmploymentRecordsForOrganisation,
} from "../employment/employment.repository.js";
import { contractTypeLabel } from "../employment/employment.types.js";

type ActivityEntry = {
  id: string;
  type: string;
  message: string;
  occurredAt: string;
};

function memberDisplayName(
  member: { full_name?: string | null; profile_email?: string | null; email?: string | null; title?: string | null } | undefined,
): string {
  return member?.full_name ?? member?.profile_email ?? member?.email ?? member?.title ?? "Someone";
}

export async function getOrganisationActivity(
  userId: number,
  organisationId: number,
  limit = 100,
) {
  await requireOccupancyCapability(userId, organisationId);

  const [
    members,
    positions,
    occupancyHistory,
    departments,
    workItems,
    reports,
    attachments,
    projectEvents,
    employmentRecords,
    contracts,
  ] = await Promise.all([
    listMembers(organisationId),
    listPositions(organisationId),
    listOccupancyHistoryForOrganisation(organisationId),
    listDepartmentSummaries(organisationId),
    listWorkItemsForOrganisation(organisationId),
    listReportsForOrganisation(organisationId),
    listAttachmentsForOrganisation(organisationId),
    listProjectEventsForOrganisation(organisationId, 200),
    listEmploymentRecordsForOrganisation(organisationId),
    listContractsForOrganisation(organisationId),
  ]);

  const membersById = new Map(members.map((m) => [m.id, m]));
  const positionsById = new Map(positions.map((p) => [p.id, p]));
  const workItemsById = new Map(workItems.map((w) => [w.id, w]));
  const employmentById = new Map(employmentRecords.map((e) => [e.id, e]));

  const entries: ActivityEntry[] = [];

  for (const member of members) {
    const name = memberDisplayName(member);

    if (member.joined_at) {
      entries.push({
        id: `member-joined-${member.id}`,
        type: "member.joined",
        message: `${name} joined the organisation.`,
        occurredAt: member.joined_at,
      });
    }

    if (member.left_at) {
      entries.push({
        id: `member-left-${member.id}`,
        type: "member.concluded",
        message: `${name}'s membership concluded.`,
        occurredAt: member.left_at,
      });
    }
  }

  for (const row of occupancyHistory) {
    const memberName = memberDisplayName(membersById.get(row.member_id));
    const positionName = positionsById.get(row.position_id)?.name ?? `Position #${row.position_id}`;

    entries.push({
      id: `occupancy-start-${row.id}`,
      type: "occupancy.started",
      message: `${memberName} was placed in ${positionName}.`,
      occurredAt: row.starts_at,
    });

    if (row.ends_at) {
      entries.push({
        id: `occupancy-end-${row.id}`,
        type: "occupancy.ended",
        message: `${memberName}'s placement in ${positionName} ended.`,
        occurredAt: row.ends_at,
      });
    }
  }

  for (const department of departments) {
    entries.push({
      id: `department-${department.id}`,
      type: "department.created",
      message: `Department "${department.name}" was created.`,
      occurredAt: department.created_at,
    });
  }

  for (const position of positions) {
    entries.push({
      id: `position-${position.id}`,
      type: "position.created",
      message: `Position "${position.name}" was created.`,
      occurredAt: position.created_at,
    });
  }

  for (const item of workItems) {
    entries.push({
      id: `work-created-${item.id}`,
      type: "work.created",
      message: `Work "${item.title}" was created.`,
      occurredAt: item.created_at,
    });
  }

  for (const report of reports) {
    const workTitle = workItemsById.get(report.work_item_id)?.title ?? "a work item";

    if (report.submitted_at) {
      entries.push({
        id: `report-submitted-${report.id}`,
        type: "work.report_submitted",
        message: `A report was submitted for "${workTitle}".`,
        occurredAt: report.submitted_at,
      });
    }

    if (report.state === "accepted" && report.reviewed_at) {
      entries.push({
        id: `report-accepted-${report.id}`,
        type: "work.completed",
        message: `"${workTitle}" was completed.`,
        occurredAt: report.reviewed_at,
      });
    }

    if (report.state === "returned" && report.reviewed_at) {
      entries.push({
        id: `report-returned-${report.id}`,
        type: "work.report_returned",
        message: `A report for "${workTitle}" was sent back for revision.`,
        occurredAt: report.reviewed_at,
      });
    }
  }

  for (const attachment of attachments) {
    const workTitle = workItemsById.get(attachment.work_item_id)?.title ?? "a work item";

    entries.push({
      id: `evidence-${attachment.id}`,
      type: "work.evidence_recorded",
      message: `Evidence was attached to a report on "${workTitle}".`,
      occurredAt: attachment.created_at,
    });
  }

  for (const event of projectEvents) {
    entries.push({
      id: `project-event-${event.id}`,
      type: `project.${event.type}`,
      message: event.message,
      occurredAt: event.created_at,
    });
  }

  for (const record of employmentRecords) {
    const memberName = memberDisplayName(membersById.get(record.member_id));

    entries.push({
      id: `employment-${record.id}`,
      type: "employment.created",
      message: `An employment record was created for ${memberName}.`,
      occurredAt: record.created_at,
    });
  }

  for (const contract of contracts) {
    const employmentRecord = employmentById.get(contract.employment_record_id);
    const memberName = employmentRecord
      ? memberDisplayName(membersById.get(employmentRecord.member_id))
      : "a member";

    entries.push({
      id: `contract-${contract.id}`,
      type: "employment.contract_created",
      message: `A ${contractTypeLabel(contract.contract_type)} contract was created for ${memberName}.`,
      occurredAt: contract.created_at,
    });
  }

  entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return { activity: entries.slice(0, limit) };
}
