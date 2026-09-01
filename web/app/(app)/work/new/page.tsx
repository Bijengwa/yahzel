import type { Metadata } from "next";
import { Suspense } from "react";

import { WorkCreateScreen } from "@/components/app/work/work-create-screen";

export const metadata: Metadata = { title: "New Work" };

export default function NewWorkPage() {
  // WorkCreateScreen reads ?parentId via useSearchParams, which Next requires
  // to sit inside a Suspense boundary.
  return (
    <Suspense>
      <WorkCreateScreen />
    </Suspense>
  );
}
