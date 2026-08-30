import type { Metadata } from "next";

import { WorkListScreen } from "@/components/app/work/work-list-screen";

export const metadata: Metadata = { title: "Work" };

export default function WorkPage() {
  return <WorkListScreen />;
}
