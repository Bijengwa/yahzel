"use client";

import Link from "next/link";

import { describeRelativeTime, type YzNotification } from "@/lib/notifications";

/**
 * One notification row. Dense on purpose — a dot, a message, a time — so a
 * dozen fit in the panel without scrolling.
 */
export function NotificationItem({
  notification,
  onOpen,
}: {
  notification: YzNotification;
  onOpen: (notification: YzNotification) => void;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          notification.read ? "bg-transparent" : "bg-yz-accent"
        }`}
      />

      <span className="min-w-0 flex-1">
        <span
          className={`block text-[13px] leading-5 ${
            notification.read
              ? "text-yz-neutral-600"
              : "font-semibold text-yz-ink"
          }`}
        >
          {notification.message}
        </span>

        <span className="mt-0.5 block text-[11px] text-yz-neutral-500">
          {describeRelativeTime(notification.createdAt)}
        </span>
      </span>
    </>
  );

  const className =
    "-mx-2 flex items-start gap-2 rounded-sm px-2 py-2 text-left transition-colors duration-150 hover:bg-yz-neutral-100";

  if (notification.actionUrl) {
    return (
      <Link
        href={notification.actionUrl}
        onClick={() => onOpen(notification)}
        className={`block w-full ${className}`}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={`w-full ${className}`}
    >
      {body}
    </button>
  );
}
