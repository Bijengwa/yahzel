"use client";

import { useEffect, useState, type ReactNode } from "react";

import { YahzelIcon } from "@/components/yahzel-icon";
import { Avatar } from "./avatar";
import { CompletionBanner } from "./completion-banner";
import { LogoutDialog } from "./logout-dialog";
import { Sidebar } from "./sidebar";
import { useProfile } from "./profile-provider";

/**
 * The frame every signed-in screen sits in: one sidebar on wide viewports,
 * the same sidebar as a drawer on narrow ones. There is no second mobile
 * implementation — only a different way of revealing the same panel.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { profile, loading, error, refresh } = useProfile();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  // Following a link closes the drawer through onNavigate; this covers the
  // other way out of it.
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

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-yz-bg">
        <YahzelIcon size={30} className="animate-pulse text-yz-neutral-400" />
        <span className="sr-only">Loading your profile</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-yz-bg px-6">
        <div className="w-full max-w-sm border border-yz-neutral-300 bg-white p-7 text-center">
          <YahzelIcon size={28} className="mx-auto text-yz-ink" title={null} />

          <h1 className="font-brand mt-4 text-[18px] font-extrabold text-yz-ink">
            Yahzel could not load your profile
          </h1>

          <p className="mt-2 text-[13px] leading-6 text-yz-neutral-600">
            {error ?? "Please try again."}
          </p>

          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-5 w-full bg-yz-ink px-4 py-2.5 text-[13px] font-bold text-white transition-colors duration-150 hover:bg-yz-neutral-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-yz-bg lg:flex">
      <aside className="hidden w-[264px] shrink-0 border-r border-yz-neutral-200 lg:sticky lg:top-0 lg:block lg:h-screen">
        <Sidebar onRequestLogout={() => setLogoutOpen(true)} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-yz-neutral-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className="-ml-2 flex h-10 w-10 items-center justify-center text-yz-ink"
        >
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path
              d="M3 5h14M3 10h14M3 15h14"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        </button>

        <span className="flex items-center gap-2">
          <YahzelIcon
            size={22}
            className="text-yz-ink"
            title={null}
            maskId="yz-mark-knockout-header"
          />
          <span className="font-brand text-[15px] font-extrabold tracking-tight text-yz-ink">
            Yahzel
          </span>
        </span>

        <Avatar
          fullName={profile.fullName}
          src={profile.profilePictureUrl}
          size={30}
        />
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full bg-yz-ink/40"
          />

          <div className="absolute inset-y-0 left-0 w-[264px] max-w-[85vw] border-r border-yz-neutral-200 shadow-[0_0_60px_-10px_rgba(32,30,29,0.4)]">
            <Sidebar
              onNavigate={() => setDrawerOpen(false)}
              onRequestLogout={() => {
                setDrawerOpen(false);
                setLogoutOpen(true);
              }}
            />
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          <CompletionBanner />

          {/* When the banner is absent this div is the first child, so the
              gap collapses instead of leaving a floating margin. */}
          <div className="mt-6 first:mt-0">{children}</div>
        </main>
      </div>

      <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </div>
  );
}
