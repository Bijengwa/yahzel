import { notFound } from "next/navigation";

import { ProjectDetailScreen } from "@/components/app/projects/project-detail-screen";

/**
 * The Project itself is loaded in the browser, behind the bearer token the
 * client holds — the same arrangement every other authenticated screen uses.
 * organisationId travels as a query param (Projects are API-scoped by
 * organisation, unlike Work, which resolves visibility from the token alone)
 * — every link into this page (the list, "New Project", Work's own "Project"
 * link) always supplies it.
 */
export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ organisationId?: string }>;
}) {
  const { id } = await params;
  const { organisationId: organisationIdRaw } = await searchParams;

  const projectId = Number(id);
  const organisationId = Number(organisationIdRaw);

  if (
    !Number.isInteger(projectId) ||
    projectId <= 0 ||
    !Number.isInteger(organisationId) ||
    organisationId <= 0
  ) {
    notFound();
  }

  return <ProjectDetailScreen projectId={projectId} organisationId={organisationId} />;
}
