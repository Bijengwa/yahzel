import { AppShell } from "@/components/app/app-shell";
import { ProfileProvider } from "@/components/app/profile/profile-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";

/**
 * Everything behind sign-in shares one frame and one profile fetch. The route
 * group keeps the URLs flat — /dashboard, /profile, /settings — while giving
 * them a common layout that survives navigation between them.
 */
export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <ProfileProvider>
        <AppShell>{children}</AppShell>
      </ProfileProvider>
    </ThemeProvider>
  );
}
