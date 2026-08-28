"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { YahzelIcon } from "@/components/yahzel-icon";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav";
import { useProfile } from "./profile-provider";
import { Avatar } from "./avatar";

export function Sidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { profile } = useProfile();

  const [collapsed, setCollapsed] = useState(false);
  const [topHovered, setTopHovered] = useState(false);

  function handleNavigate() {
    onNavigate?.();
  }

  return (
    <div
      className={`flex h-full flex-col bg-white transition-[width] duration-200 ${
        collapsed ? "w-[72px]" : "w-[236px]"
      }`}
    >
      {/* Brand / collapse control */}
      <div
        className="relative flex h-16 shrink-0 items-center border-b border-yz-neutral-200"
        onMouseEnter={() => setTopHovered(true)}
        onMouseLeave={() => setTopHovered(false)}
      >
        <div
          className={`flex items-center ${
            collapsed
              ? "w-full justify-center"
              : "w-full justify-between px-4"
          }`}
        >
          <div
            className={`flex items-center gap-2.5 ${
              collapsed && topHovered ? "opacity-0" : "opacity-100"
            }`}
          >
            <YahzelIcon
              size={27}
              className="shrink-0 text-yz-ink"
              title={null}
              maskId="yz-sidebar-mark"
            />

            {!collapsed && (
              <span className="font-brand text-[17px] leading-none font-extrabold tracking-tight text-yz-ink">
                Yahzel
              </span>
            )}
          </div>

          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="flex h-9 w-9 items-center justify-center text-yz-ink transition-colors hover:bg-yz-neutral-100"
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
          )}
        </div>

        {collapsed && topHovered && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="absolute inset-0 flex items-center justify-center bg-white text-yz-ink"
          >
            <svg
              viewBox="0 0 20 20"
              width="20"
              height="20"
              aria-hidden="true"
            >
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </button>
        )}
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