import type { Metadata } from "next";

import { StalledWorkScreen } from "@/components/app/work/stalled-work-screen";

export const metadata: Metadata = { title: "Stalled work" };

export default function StalledWorkPage() {
  return <StalledWorkScreen />;
}
