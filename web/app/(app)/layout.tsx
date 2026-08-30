import { AppShell } from "@/components/app/app-shell";
import { ProfileProvider } from "@/components/app/profile/profile-provider";

/**
 * Everything behind sign-in shares one frame and one profile fetch. The route
 * group keeps the URLs flat — /dashboard, /profile, /settings — while giving
 * them a common layout that survives navigation between them.
 *
 * The theme lives one level up, in the root layout, so the authentication
 * screens share the same preference.
 */
export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProfileProvider>
      <AppShell>{children}</AppShell>
    </ProfileProvider>
  );
}
