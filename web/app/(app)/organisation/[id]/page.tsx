import { notFound } from "next/navigation";

import { OrganisationScreen } from "@/components/app/organisation/organisation-screen";

/**
 * The organisation itself is loaded in the browser, behind the bearer token
 * the client holds — the same arrangement every other authenticated screen
 * uses. Only the id is resolved here.
 */
export default async function OrganisationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const organisationId = Number(id);

  if (!Number.isInteger(organisationId) || organisationId <= 0) {
    notFound();
  }

  return <OrganisationScreen organisationId={organisationId} />;
}
