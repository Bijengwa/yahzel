import type { Metadata } from "next";

import { WorkSettingsScreen } from "@/components/app/work/work-settings-screen";

export const metadata: Metadata = { title: "Work settings" };

export default function WorkSettingsPage() {
  return <WorkSettingsScreen />;
}
