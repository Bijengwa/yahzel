"use client";

import { useEffect, useState, type ReactNode } from "react";

import { YahzelIcon } from "@/components/yahzel-icon";
import { ThemeToggleButton } from "@/components/theme/theme-provider";
import { Avatar } from "./profile/avatar";
import { CompletionBanner } from "./profile/completion-banner";
import { Sidebar } from "./sidebar";
import { useProfile } from "./profile/profile-provider";

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, loading, error, refresh } = useProfile();

  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-yz-bg">
        <YahzelIcon
          size={30}
          className="animate-pulse text-yz-neutral-400"
        />

        <span className="sr-only">Loading your profile</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-yz-bg px-6">
        <div className="w-full max-w-sm border border-yz-neutral-300 bg-yz-panel p-7 text-center">
          <YahzelIcon
            size={28}
            className="mx-auto text-yz-ink"
            title={null}
          />

          <h1 className="font-brand mt-4 text-[18px] font-extrabold text-yz-ink">
            Yahzel could not load your profile
          </h1>

          <p className="mt-2 text-[13px] leading-6 text-yz-neutral-600">
            {error ?? "Please try again."}
          </p>

          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-5 w-full bg-yz-ink px-4 py-2.5 text-[13px] font-bold text-yz-ink-contrast transition-colors duration-150 hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-yz-bg">
      {/* Thin top workspace bar — the one persistent piece of chrome shared
          by every breakpoint. Brand lives here, not in the sidebar, so the
          sidebar can stay a pure nav rail. */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-yz-neutral-200 bg-yz-panel px-3 lg:px-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="flex h-9 w-9 items-center justify-center text-yz-ink lg:hidden"
          >
            <svg
              viewBox="0 0 20 20"
              width="19"
              height="19"
              aria-hidden="true"
            >
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </button>

          <span className="flex items-center gap-2">
            <YahzelIcon
              size={20}
              className="text-yz-ink"
              title={null}
              maskId="yz-topbar-mark"
            />

            <span className="font-brand text-[14px] font-extrabold tracking-tight text-yz-ink">
              Yahzel
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggleButton />

          <span className="lg:hidden">
            <Avatar
              fullName={profile.fullName}
              src={profile.profilePictureUrl}
              size={28}
            />
          </span>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-12 hidden h-[calc(100vh-3rem)] shrink-0 lg:block">
          <Sidebar />
        </aside>

        <div className="min-w-0 flex-1">
          <main className="w-full px-4 py-4 sm:px-5 sm:py-5 xl:px-6 xl:py-6">
            <CompletionBanner />

            <div className="mt-4">
              {children}
            </div>
          </main>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full bg-black/40"
          />

          <div className="absolute top-12 bottom-0 left-0 w-[236px] max-w-[85vw] border-r border-yz-neutral-200 bg-yz-panel shadow-[0_0_60px_-10px_rgba(0,0,0,0.45)]">
            <Sidebar
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
