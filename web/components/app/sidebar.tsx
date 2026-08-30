"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

import { YahzelIcon } from "@/components/yahzel-icon";
import { NAV_ITEMS, SETTINGS_ITEM } from "./profile/nav";
import { useProfile } from "./profile/profile-provider";
import { Avatar } from "./profile/avatar";

const NAV_LINK =
  "flex h-9 items-center rounded-lg text-[13px] font-semibold transition-colors duration-150";

export function Sidebar({
  onNavigate,
  variant = "rail",
}: {
  onNavigate?: () => void;
  variant?: "rail" | "drawer";
}) {
  const pathname = usePathname();
  const { profile } = useProfile();

  const [railCollapsed, setRailCollapsed] = useState(false);

  const collapsed = variant === "rail" && railCollapsed;

  const uid = useId();

  function handleNavigate() {
    onNavigate?.();
  }

  return (
    <div
      className={`flex h-full flex-col border-r border-yz-neutral-200 bg-yz-panel transition-[width] duration-200 ${
        variant === "drawer" ? "w-full" : collapsed ? "w-14" : "w-[216px]"
      }`}
    >
      <div
        className={`flex h-12 shrink-0 items-center border-b border-yz-neutral-200 ${
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
          className="group relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-yz-ink transition-colors hover:bg-yz-neutral-100"
        >
          {collapsed ? (
            <>
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
                      ? "bg-yz-neutral-100 text-yz-ink"
                      : "text-yz-neutral-600 hover:bg-yz-neutral-100 hover:text-yz-ink"
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
              ? "bg-yz-neutral-100 text-yz-ink"
              : "text-yz-neutral-600 hover:bg-yz-neutral-100 hover:text-yz-ink"
          }`}
        >
          <span className="shrink-0">{SETTINGS_ITEM.icon}</span>

          {!collapsed && <span>Settings</span>}
        </Link>

        {profile && (
          <Link
            href="/profile"
            onClick={handleNavigate}
            title={collapsed ? profile.fullName : undefined}
            aria-label={`Open profile for ${profile.fullName}`}
            className={`mt-1 flex items-center rounded-lg py-1.5 transition-colors hover:bg-yz-neutral-100 ${
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
