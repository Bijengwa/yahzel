"use client";

import type { YzNotification } from "@/lib/notifications";
import { useNotifications } from "./notifications-provider";
import { NotificationItem } from "./notification-item";

/**
 * The compact dropdown the bell opens. It reads straight from
 * NotificationsProvider, so it is never more than one SSE event behind the
 * badge that opened it.
 */
export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { notifications, unreadCount, loading, markRead, markAllRead } =
    useNotifications();

  function handleOpen(notification: YzNotification) {
    void markRead(notification.id);
    onClose();
  }

  return (
    <div
      role="menu"
      aria-label="Notifications"
      className="w-80 rounded-md border border-yz-neutral-200 bg-yz-panel shadow-[0_8px_30px_-8px_rgba(0,0,0,0.25)]"
    >
      <div className="flex items-center justify-between border-b border-yz-neutral-200 px-3 py-2">
        <span className="text-[12px] font-bold text-yz-neutral-600">
          Notifications
        </span>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-[11px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto px-3 py-1.5">
        {loading ? (
          <p className="py-3 text-center text-[12.5px] text-yz-neutral-600">
            Loading…
          </p>
        ) : notifications.length === 0 ? (
          <p className="py-3 text-center text-[12.5px] text-yz-neutral-600">
            Nothing yet.
          </p>
        ) : (
          <ul className="divide-y divide-yz-neutral-200">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <NotificationItem
                  notification={notification}
                  onOpen={handleOpen}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
