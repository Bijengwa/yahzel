import { notFound } from "next/navigation";

import { MemberHistoryScreen } from "@/components/app/intelligence/member-history-screen";

export default async function MemberHistoryPage({
  params,
}: {
  params: Promise<{ id: string; memberId: string }>;
}) {
  const { id, memberId } = await params;
  const organisationId = Number(id);
  const memberIdNumber = Number(memberId);

  if (
    !Number.isInteger(organisationId) ||
    organisationId <= 0 ||
    !Number.isInteger(memberIdNumber) ||
    memberIdNumber <= 0
  ) {
    notFound();
  }

  return <MemberHistoryScreen organisationId={organisationId} memberId={memberIdNumber} />;
}
