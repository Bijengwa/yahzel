import { notFound } from "next/navigation";

import { OverviewScreen } from "@/components/app/intelligence/overview-screen";

export default async function OrganisationOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organisationId = Number(id);

  if (!Number.isInteger(organisationId) || organisationId <= 0) {
    notFound();
  }

  return <OverviewScreen organisationId={organisationId} />;
}
