import { notFound } from "next/navigation";

import { ActivityScreen } from "@/components/app/intelligence/activity-screen";

export default async function OrganisationActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organisationId = Number(id);

  if (!Number.isInteger(organisationId) || organisationId <= 0) {
    notFound();
  }

  return <ActivityScreen organisationId={organisationId} />;
}
