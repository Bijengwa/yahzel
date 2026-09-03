import { requireOccupancyCapability } from "../organisation/organisation.service.js";
import { listMembers } from "../organisation/organisation.repository.js";
import { listPositions } from "../hierarchy/hierarchy.repository.js";
import { listDepartmentSummaries } from "../departments/department.repository.js";
import { listWorkItemsForOrganisation } from "../work/work.repository.js";
import { listOutcomesForOrganisation, listProjects } from "../projects/project.repository.js";

const MAX_RESULTS_PER_CATEGORY = 8;
const MIN_QUERY_LENGTH = 2;

type SearchResult = {
  type: "person" | "position" | "department" | "work" | "project" | "outcome";
  id: number;
  title: string;
  subtitle: string;
  url: string;
};

function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  return fields.some((field) => field?.toLowerCase().includes(query));
}

export async function searchOrganisation(userId: number, organisationId: number, rawQuery: unknown) {
  await requireOccupancyCapability(userId, organisationId);

  const query = typeof rawQuery === "string" ? rawQuery.trim().toLowerCase() : "";

  const empty = { people: [], positions: [], departments: [], work: [], projects: [], outcomes: [] };

  if (query.length < MIN_QUERY_LENGTH) {
    return { query, results: empty as Record<keyof typeof empty, SearchResult[]> };
  }

  const [members, positions, departments, workItems, projects, outcomes] = await Promise.all([
    listMembers(organisationId),
    listPositions(organisationId),
    listDepartmentSummaries(organisationId),
    listWorkItemsForOrganisation(organisationId),
    listProjects(organisationId),
    listOutcomesForOrganisation(organisationId),
  ]);

  const projectsById = new Map(projects.map((p) => [p.id, p]));

  const people: SearchResult[] = members
    .filter((m) => matches(query, m.full_name, m.username, m.profile_email, m.title))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((m) => ({
      type: "person" as const,
      id: m.id,
      title: m.full_name ?? m.profile_email ?? `Member #${m.id}`,
      subtitle: m.title ?? m.organisation_class,
      url: `/organisation/${organisationId}`,
    }));

  const positionResults: SearchResult[] = positions
    .filter((p) => matches(query, p.name))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((p) => ({
      type: "position" as const,
      id: p.id,
      title: p.name,
      subtitle: "Position",
      url: `/organisation/${organisationId}/hierarchy`,
    }));

  const departmentResults: SearchResult[] = departments
    .filter((d) => matches(query, d.name))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((d) => ({
      type: "department" as const,
      id: d.id,
      title: d.name,
      subtitle: "Department",
      url: `/organisation/${organisationId}/hierarchy`,
    }));

  const workResults: SearchResult[] = workItems
    .filter((w) => matches(query, w.title, w.description))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((w) => ({
      type: "work" as const,
      id: w.id,
      title: w.title,
      subtitle: w.status,
      url: `/work/${w.id}`,
    }));

  const projectResults: SearchResult[] = projects
    .filter((p) => matches(query, p.name, p.description))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((p) => ({
      type: "project" as const,
      id: p.id,
      title: p.name,
      subtitle: p.status,
      url: `/projects/${organisationId}/${p.id}`,
    }));

  const outcomeResults: SearchResult[] = outcomes
    .filter((o) => matches(query, o.title, o.description))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((o) => ({
      type: "outcome" as const,
      id: o.id,
      title: o.title,
      subtitle: projectsById.get(o.project_id)?.name ?? o.status,
      url: `/projects/${organisationId}/${o.project_id}`,
    }));

  return {
    query,
    results: {
      people,
      positions: positionResults,
      departments: departmentResults,
      work: workResults,
      projects: projectResults,
      outcomes: outcomeResults,
    },
  };
}
