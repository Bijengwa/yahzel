import { notFound } from "next/navigation";

import { HierarchyScreen } from "@/components/app/hierarchy/hierarchy-screen";

/**
 * The hierarchy itself is loaded in the browser, behind the bearer token the
 * client holds — the same arrangement every other authenticated screen uses.
 * Only the id is resolved here.
 */
export default async function OrganisationHierarchyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const organisationId = Number(id);

  if (!Number.isInteger(organisationId) || organisationId <= 0) {
    notFound();
  }

  return <HierarchyScreen organisationId={organisationId} />;
}
