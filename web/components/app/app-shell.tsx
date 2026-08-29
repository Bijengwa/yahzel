"use client";

import { useEffect, useState, type ReactNode } from "react";

import { YahzelIcon } from "@/components/yahzel-icon";
import { ThemeToggleButton } from "@/components/theme/theme-provider";
import { NotificationBell } from "./notifications/notification-bell";
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

    // Growing past the lg breakpoint brings the permanent rail back; the
    // drawer must not stay open behind it.
    const desktop = window.matchMedia("(min-width: 1024px)");

    function onBreakpoint(event: MediaQueryListEvent) {
      if (event.matches) {
        setDrawerOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onBreakpoint);

    // The page behind a drawer should not scroll with it.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onBreakpoint);
      document.body.style.overflow = overflow;
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
        <div className="w-full max-w-sm rounded-md border border-yz-neutral-300 bg-yz-panel p-7 text-center">
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
            className="mt-5 w-full rounded-sm bg-yz-ink px-4 py-2.5 text-[13px] font-bold text-yz-ink-contrast transition-colors duration-150 hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-yz-bg">
      {/* Sidebar owns the full viewport height and its own brand header —
          the content pane's thin bar sits beside it, not above it, so the
          two read as one connected frame rather than stacked headers. */}
      <aside className="sticky top-0 hidden h-screen shrink-0 lg:block">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center border-b border-yz-neutral-200 bg-yz-panel px-3 lg:px-4">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen((open) => !open)}
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
              className="flex h-8 w-8 items-center justify-center rounded-sm text-yz-ink"
            >
              <svg
                viewBox="0 0 20 20"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path
                  d="M3 5.5h14M3 10h14M3 14.5h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <span className="flex items-center gap-1.5">
              <YahzelIcon
                size={18}
                className="text-yz-ink"
                title={null}
                maskId="yz-topbar-mark"
              />

              <span className="font-brand text-[13px] font-extrabold tracking-tight text-yz-ink">
                Yahzel
              </span>
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />

            <ThemeToggleButton />

            <span className="lg:hidden">
              <Avatar
                fullName={profile.fullName}
                src={profile.profilePictureUrl}
                size={26}
              />
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-3 sm:px-5 sm:py-4">
          <CompletionBanner />

          <div className="mt-3">
            {children}
          </div>
        </main>
      </div>

      {/* The drawer is mounted only while it is open: closed, there is no
          overlay left on the page to swallow taps, and the content has the
          whole viewport to itself. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full bg-black/40"
          />

          <div className="absolute inset-y-0 left-0 w-[240px] max-w-[85vw] shadow-[0_0_60px_-10px_rgba(0,0,0,0.45)]">
            <Sidebar
              variant="drawer"
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
