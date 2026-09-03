import type { Metadata } from "next";

import { HiringScreen } from "@/components/app/hiring/hiring-screen";

export const metadata: Metadata = {
  title: "Hiring",
};

export default function HiringPage() {
  return <HiringScreen />;
}
