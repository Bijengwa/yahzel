import type { Metadata } from "next";

import { RegisterOrganisationScreen } from "@/components/app/organisation/register-screen";

export const metadata: Metadata = {
  title: "Register an organisation",
};

export default function RegisterOrganisationPage() {
  return <RegisterOrganisationScreen />;
}
