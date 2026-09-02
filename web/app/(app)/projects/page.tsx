import type { Metadata } from "next";

import { ProjectsListScreen } from "@/components/app/projects/projects-list-screen";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return <ProjectsListScreen />;
}
