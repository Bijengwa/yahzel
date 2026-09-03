import { notFound } from "next/navigation";

import { AttentionScreen } from "@/components/app/intelligence/attention-screen";

export default async function OrganisationAttentionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organisationId = Number(id);

  if (!Number.isInteger(organisationId) || organisationId <= 0) {
    notFound();
  }

  return <AttentionScreen organisationId={organisationId} />;
}
