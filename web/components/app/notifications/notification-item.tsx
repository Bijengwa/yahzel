"use client";

import Link from "next/link";

import { describeRelativeTime, type YzNotification } from "@/lib/notifications";

/**
 * One non-invitation notification row: a dot, a message, a time. Dense on
 * purpose so the OTHER section reads as a compact list rather than a stack
 * of cards.
 */
export function NotificationItem({
  notification,
  onOpen,
  onDelete,
}: {
  notification: YzNotification;
  onOpen: (notification: YzNotification) => void;
  onDelete: (notification: YzNotification) => void;
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
    "flex flex-1 items-start gap-2 py-2.5 text-left transition-colors duration-150 hover:bg-yz-neutral-100";

  return (
    <div className="flex w-full items-start gap-1">
      {notification.actionUrl ? (
        <Link href={notification.actionUrl} onClick={() => onOpen(notification)} className={className}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={() => onOpen(notification)} className={className}>
          {body}
        </button>
      )}

      <button
        type="button"
        aria-label="Delete notification"
        title="Delete"
        onClick={() => onDelete(notification)}
        className="mt-2.5 shrink-0 px-1.5 text-[13px] text-yz-neutral-400 hover:text-yz-danger-ink"
      >
        ×
      </button>
    </div>
  );
}
