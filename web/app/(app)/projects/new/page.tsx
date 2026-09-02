import type { Metadata } from "next";
import { Suspense } from "react";

import { ProjectCreateScreen } from "@/components/app/projects/project-create-screen";

export const metadata: Metadata = { title: "New Project" };

export default function NewProjectPage() {
  // ProjectCreateScreen reads ?organisationId via useSearchParams, which Next
  // requires to sit inside a Suspense boundary.
  return (
    <Suspense>
      <ProjectCreateScreen />
    </Suspense>
  );
}
