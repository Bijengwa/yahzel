import type { Metadata } from "next";

import { WorkCreateScreen } from "@/components/app/work/work-create-screen";

export const metadata: Metadata = { title: "New Work" };

export default function NewWorkPage() {
  return <WorkCreateScreen />;
}
