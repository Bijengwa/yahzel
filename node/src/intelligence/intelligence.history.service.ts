import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { findMembershipById } from "../organisation/organisation.repository.js";
import { publicMembership } from "../organisation/organisation.service.js";
import { listPositions } from "../hierarchy/hierarchy.repository.js";
import { listOccupancyHistoryByMember } from "../hierarchy/occupancy.repository.js";
import { listDepartmentsForMember } from "../departments/department.repository.js";
import {
  listContractsByEmploymentRecord,
  listEmploymentHistoryByMember,
} from "../employment/employment.repository.js";
import { publicContract, publicEmploymentRecord } from "../employment/employment.service.js";
import {
  listAttachmentsForOrganisation,
  listReportsForOrganisation,
  listVisibleWorkItems,
} from "../work/work.repository.js";
import { publicWorkItem } from "../work/work.service.js";
import {
  listOutcomesForOrganisation,
  listProjectMembershipsForProfile,
  listProjects,
} from "../projects/project.repository.js";
import { publicOutcome, publicProject } from "../projects/project.service.js";
import { IntelligenceError } from "./intelligence.signal.service.js";

export async function getMemberOperationalHistory(
  userId: number,
  organisationId: number,
  memberId: number,
) {
  await requireOccupancyCapability(userId, organisationId);

  const member = await findMembershipById(organisationId, memberId);

  if (!member) {
    throw IntelligenceError.field(404, "form", "That person could not be found.");
  }

  const profileId = member.profile_id;

  const [occupancyHistory, departments, employmentHistory, positions] = await Promise.all([
    listOccupancyHistoryByMember(organisationId, member.id),
    listDepartmentsForMember(member.id),
    listEmploymentHistoryByMember(member.id),
    listPositions(organisationId),
  ]);

  const positionsById = new Map(positions.map((p) => [p.id, p]));

  const employment = await Promise.all(
    employmentHistory.map(async (record) => ({
      employmentRecord: publicEmploymentRecord(record),
      contracts: (await listContractsByEmploymentRecord(record.id)).map(publicContract),
    })),
  );

  let workItems: ReturnType<typeof publicWorkItem>[] = [];
  let reports: { id: number; workItemId: number; state: string; submittedAt: string | null; reviewedAt: string | null }[] = [];
  let evidence: { id: number; workItemId: number; fileName: string; createdAt: string }[] = [];
  let projects: ReturnType<typeof publicProject>[] = [];
  let outcomesOwned: ReturnType<typeof publicOutcome>[] = [];

  if (profileId !== null) {
    const visible = await listVisibleWorkItems(profileId);
    workItems = visible
      .filter((item) => item.organisation_id === organisationId)
      .map(publicWorkItem);

    const allReports = await listReportsForOrganisation(organisationId);
    reports = allReports
      .filter((r) => r.author_profile_id === profileId)
      .map((r) => ({
        id: r.id,
        workItemId: r.work_item_id,
        state: r.state,
        submittedAt: r.submitted_at,
        reviewedAt: r.reviewed_at,
      }));

    const allAttachments = await listAttachmentsForOrganisation(organisationId);
    evidence = allAttachments
      .filter((a) => a.uploaded_by_profile_id === profileId)
      .map((a) => ({
        id: a.id,
        workItemId: a.work_item_id,
        fileName: a.file_name,
        createdAt: a.created_at,
      }));

    const [owned, memberOf, allOutcomes] = await Promise.all([
      listProjects(organisationId),
      listProjectMembershipsForProfile(organisationId, profileId),
      listOutcomesForOrganisation(organisationId),
    ]);

    const projectMap = new Map(
      [...owned.filter((p) => p.owner_profile_id === profileId), ...memberOf].map((p) => [p.id, p]),
    );
    projects = [...projectMap.values()].map(publicProject);

    outcomesOwned = allOutcomes
      .filter((o) => o.owner_profile_id === profileId)
      .map(publicOutcome);
  }

  return {
    memberId: member.id,
    profileId,
    membership: publicMembership(member),
    structure: {
      positions: occupancyHistory.map((row) => ({
        positionId: row.position_id,
        positionName: positionsById.get(row.position_id)?.name ?? null,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        isActive: row.ends_at === null,
      })),
      departments: departments.map((d) => ({ id: d.id, name: d.name })),
    },
    employment,
    work: { items: workItems, reports, evidence },
    projects: { memberships: projects, outcomesOwned },
  };
}
