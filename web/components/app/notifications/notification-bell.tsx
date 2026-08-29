"use client";

import { useEffect, useRef, useState } from "react";

import { useNotifications } from "./notifications-provider";
import { NotificationPanel } from "./notification-panel";

/**
 * The header entry point for notifications: a bell, a badge when something
 * is unread, and the compact panel it opens — the existing icon language
 * (see profile/nav.tsx), not a new visual system.
 */
export function NotificationBell() {
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
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
            className="absolute right-1 top-1 flex h-[7px] w-[7px] rounded-full bg-yz-danger-ink"
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5">
          <NotificationPanel onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
