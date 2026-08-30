"use client";

import Link from "next/link";

import { useNotifications } from "./notifications-provider";

/**
 * The header entry point for notifications: a bell with an unread badge
 * that opens the dedicated /notifications page — never a dropdown, so the
 * same view works identically on mobile and desktop.
 */
export function NotificationBell() {
  const { unreadCount } = useNotifications();

  return (
    <Link
      href="/notifications"
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications"
      }
      className="relative flex h-8 w-8 items-center justify-center rounded-sm text-yz-ink transition-colors hover:bg-yz-neutral-100"
    >
      <svg
        viewBox="0 0 20 20"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 8a5 5 0 0 1 10 0c0 3.2 1 4.6 1.6 5.2H3.4C4 12.6 5 11.2 5 8z" />
        <path d="M8.2 15.8a1.8 1.8 0 0 0 3.6 0" />
      </svg>

      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-yz-danger-ink px-1 text-[9px] font-bold leading-none text-white"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
