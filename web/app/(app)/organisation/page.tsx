import type { Metadata } from "next";

import { ParticipationScreen } from "@/components/app/organisation/participation-screen";

export const metadata: Metadata = {
  title: "Organisation",
};

export default function OrganisationPage() {
  return <ParticipationScreen />;
}
