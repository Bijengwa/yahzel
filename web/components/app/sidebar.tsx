"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { NAV_ITEMS, SETTINGS_ITEM } from "./profile/nav";
import { useProfile } from "./profile/profile-provider";
import { Avatar } from "./profile/avatar";

export function Sidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { profile } = useProfile();

  const [collapsed, setCollapsed] = useState(false);

  function handleNavigate() {
    onNavigate?.();
  }

  return (
    <div
      className={`flex h-full flex-col bg-yz-panel transition-[width] duration-200 ${
        collapsed ? "w-[72px]" : "w-[236px]"
      }`}
    >
      {/* Collapse control — brand now lives in the top workspace bar, so
          this rail is pure navigation chrome. */}
      <div className="flex h-12 shrink-0 items-center justify-end border-b border-yz-neutral-200 px-2">
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-9 w-9 items-center justify-center text-yz-ink transition-colors hover:bg-yz-neutral-100"
        >
          <svg
            viewBox="0 0 20 20"
            width="18"
            height="18"
            aria-hidden="true"
          >
            <path
              d="M3 5h14M3 10h14M3 15h14"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        </button>
      </div>

      {/* Main navigation */}
      <nav
        className="flex-1 overflow-y-auto px-2.5 py-4"
        aria-label="Main"
      >
        <ul className="space-y-1">
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
                  className={`group flex h-10 items-center rounded-sm border-l-2 transition-colors duration-150 ${
                    collapsed
                      ? "justify-center px-0"
                      : "gap-3 px-3"
                  } ${
                    active
                      ? "border-yz-accent bg-yz-neutral-100 text-yz-ink"
                      : "border-transparent text-yz-neutral-700 hover:bg-yz-neutral-100 hover:text-yz-ink"
                  }`}
                >
                  <span
                    className={`shrink-0 ${
                      active
                        ? "text-yz-ink"
                        : "text-yz-accent"
                    }`}
                  >
                    {item.icon}
                  </span>

                  {!collapsed && (
                    <span className="text-[13px] font-semibold">
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom navigation */}
      <div className="shrink-0 border-t border-yz-neutral-200 px-2.5 py-3">
        <Link
          href={SETTINGS_ITEM.href}
          onClick={handleNavigate}
          title={collapsed ? "Settings" : undefined}
          aria-current={
            pathname === SETTINGS_ITEM.href ? "page" : undefined
          }
          className={`mb-1 flex h-10 items-center rounded-sm border-l-2 transition-colors duration-150 ${
            collapsed
              ? "justify-center px-0"
              : "gap-3 px-3"
          } ${
            pathname === SETTINGS_ITEM.href
              ? "border-yz-accent bg-yz-neutral-100 text-yz-ink"
              : "border-transparent text-yz-neutral-700 hover:bg-yz-neutral-100 hover:text-yz-ink"
          }`}
        >
          <span
            className={
              pathname === SETTINGS_ITEM.href
                ? "text-yz-ink"
                : "text-yz-accent"
            }
          >
            {SETTINGS_ITEM.icon}
          </span>

          {!collapsed && (
            <span className="text-[13px] font-semibold">
              Settings
            </span>
          )}
        </Link>

        {/* Profile picture = profile button */}
        {profile && (
          <Link
            href="/profile"
            onClick={handleNavigate}
            title={collapsed ? profile.fullName : undefined}
            aria-label={`Open profile for ${profile.fullName}`}
            className={`flex h-11 items-center rounded-sm transition-colors hover:bg-yz-neutral-100 ${
              collapsed
                ? "justify-center px-0"
                : "gap-3 px-3"
            }`}
          >
            <Avatar
              fullName={profile.fullName}
              src={profile.profilePictureUrl}
              size={36}
              className="rounded-full"
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
