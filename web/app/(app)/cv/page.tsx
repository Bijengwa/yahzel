import type { Metadata } from "next";

import { CvScreen } from "@/components/app/cv/cv-screen";

export const metadata: Metadata = {
  title: "CV & Portfolio",
};

export default function CvPage() {
  return <CvScreen />;
}
