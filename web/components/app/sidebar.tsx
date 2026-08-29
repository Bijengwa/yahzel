"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { YahzelIcon } from "@/components/yahzel-icon";
import { NAV_ITEMS, SETTINGS_ITEM } from "./profile/nav";
import { useProfile } from "./profile/profile-provider";
import { Avatar } from "./profile/avatar";

const NAV_LINK =
  "flex h-9 items-center rounded-sm text-[13px] font-semibold transition-colors duration-150";

export function Sidebar({
  onNavigate,
  variant = "rail",
}: {
  onNavigate?: () => void;
  /**
   * "rail" is the desktop sidebar, which can be collapsed to icons.
   * "drawer" is the mobile overlay: it is never collapsible — it is either
   * open or gone — and its control closes it instead.
   */
  variant?: "rail" | "drawer";
}) {
  const pathname = usePathname();
  const { profile } = useProfile();

  const [railCollapsed, setRailCollapsed] = useState(false);

  // A drawer is never a narrower desktop sidebar; it is a full-width panel
  // that is either open or not on the page at all.
  const collapsed = variant === "rail" && railCollapsed;

  // The desktop rail stays mounted (just display:none) even when the mobile
  // drawer's own Sidebar instance is open, so the knockout mask id must be
  // unique per instance — a collision paints the mark as a solid block.
  const uid = useId();

  function handleNavigate() {
    onNavigate?.();
  }

  return (
    <div
      className={`flex h-full flex-col border-r border-yz-neutral-200 bg-yz-panel transition-[width] duration-200 ${
        variant === "drawer" ? "w-full" : collapsed ? "w-14" : "w-[200px]"
      }`}
    >
      {/* Brand + collapse control */}
      <div
        className={`flex h-11 shrink-0 items-center border-b border-yz-neutral-200 ${
          collapsed ? "justify-center px-0" : "justify-between px-2.5"
        }`}
      >
        {!collapsed && (
          <span className="flex min-w-0 items-center gap-2">
            <YahzelIcon
              size={19}
              className="shrink-0 text-yz-ink"
              title={null}
              maskId={`yz-sidebar-mark-${uid}`}
            />

            <span className="font-brand truncate text-[14px] font-extrabold tracking-tight text-yz-ink">
              Yahzel
            </span>
          </span>
        )}

        <button
          type="button"
          onClick={() =>
            variant === "drawer"
              ? onNavigate?.()
              : setRailCollapsed((current) => !current)
          }
          aria-label={
            variant === "drawer"
              ? "Close menu"
              : collapsed
                ? "Expand sidebar"
                : "Collapse sidebar"
          }
          title={
            variant === "drawer"
              ? "Close menu"
              : collapsed
                ? "Expand sidebar"
                : "Collapse sidebar"
          }
          className="group relative flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-yz-ink transition-colors hover:bg-yz-neutral-100"
        >
          {collapsed ? (
            <>
              {/* Default: the mark. On hover, it fades out for a hamburger
                  underneath — signalling "click to open the sidebar"
                  without ever permanently losing the brand mark. */}
              <YahzelIcon
                size={17}
                className="text-yz-ink transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
                title={null}
                maskId={`yz-sidebar-mark-collapsed-${uid}`}
              />

              <svg
                viewBox="0 0 20 20"
                width="16"
                height="16"
                aria-hidden="true"
                className="absolute opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                <path
                  d="M3 5.5h14M3 10h14M3 14.5h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </>
          ) : (
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path
                d={
                  variant === "drawer"
                    ? "M5 5l10 10M15 5L5 15"
                    : "M3 5.5h14M3 10h14M3 14.5h14"
                }
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Main">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                pathname.startsWith(`${item.href}/`));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={handleNavigate}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`${NAV_LINK} ${
                    collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
                  } ${
                    active
                      ? "text-yz-accent"
                      : "text-yz-neutral-700 hover:bg-yz-neutral-100 hover:text-yz-ink"
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>

                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Settings + profile, pinned to the bottom */}
      <div className="shrink-0 border-t border-yz-neutral-200 px-2 py-2">
        <Link
          href={SETTINGS_ITEM.href}
          onClick={handleNavigate}
          title={collapsed ? "Settings" : undefined}
          aria-current={
            pathname === SETTINGS_ITEM.href ? "page" : undefined
          }
          className={`${NAV_LINK} ${
            collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
          } ${
            pathname === SETTINGS_ITEM.href
              ? "text-yz-accent"
              : "text-yz-neutral-700 hover:bg-yz-neutral-100 hover:text-yz-ink"
          }`}
        >
          <span className="shrink-0">{SETTINGS_ITEM.icon}</span>

          {!collapsed && <span>Settings</span>}
        </Link>

        {/* The profile picture is the profile button — no extra chrome. */}
        {profile && (
          <Link
            href="/profile"
            onClick={handleNavigate}
            title={collapsed ? profile.fullName : undefined}
            aria-label={`Open profile for ${profile.fullName}`}
            className={`mt-1 flex items-center rounded-sm py-1.5 transition-colors hover:bg-yz-neutral-100 ${
              collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
            }`}
          >
            <Avatar
              fullName={profile.fullName}
              src={profile.profilePictureUrl}
              size={28}
            />

            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-[12px] font-bold text-yz-ink">
                  {profile.fullName}
                </p>

                <p className="truncate font-mono text-[11px] text-yz-neutral-600">
                  @{profile.username}
                </p>
              </div>
            )}
          </Link>
        )}
      </div>
    </div>
  );
}
