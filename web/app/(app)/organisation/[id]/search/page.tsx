import { notFound } from "next/navigation";

import { SearchScreen } from "@/components/app/intelligence/search-screen";

export default async function OrganisationSearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organisationId = Number(id);

  if (!Number.isInteger(organisationId) || organisationId <= 0) {
    notFound();
  }

  return <SearchScreen organisationId={organisationId} />;
}
