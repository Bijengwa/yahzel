import { notFound } from "next/navigation";

import { WorkDetailScreen } from "@/components/app/work/work-detail-screen";

/**
 * The Work Item itself is loaded in the browser, behind the bearer token the
 * client holds — the same arrangement every other authenticated screen uses.
 * Only the id is resolved here.
 */
export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const workItemId = Number(id);

  if (!Number.isInteger(workItemId) || workItemId <= 0) {
    notFound();
  }

  return <WorkDetailScreen workItemId={workItemId} />;
}
