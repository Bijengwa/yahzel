import type { Metadata } from "next";

import { CapabilitiesScreen } from "@/components/app/work/capabilities-screen";

export const metadata: Metadata = { title: "Capabilities" };

export default function CapabilitiesPage() {
  return <CapabilitiesScreen />;
}
