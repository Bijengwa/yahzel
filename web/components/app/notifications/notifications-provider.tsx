"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
  type YzNotification,
} from "@/lib/notifications";
import { getToken } from "@/lib/session";

type NotificationsContextValue = {
  notifications: YzNotification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

export function useNotifications(): NotificationsContextValue {
  const value = useContext(NotificationsContext);

  if (!value) {
    throw new Error(
      "useNotifications must be used inside NotificationsProvider.",
    );
  }

  return value;
}

/**
 * Loads the signed-in person's notifications once for the whole
 * authenticated area, then keeps them current with the SSE stream — the
 * bell badge and the panel both read from here, so they can never disagree
 * about what is unread.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<YzNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Guards against a notification arriving twice — once from the initial
  // fetch, once from an SSE event that raced it.
  const seenIds = useRef(new Set<number>());

  const load = useCallback(async () => {
    try {
      const { notifications: next, unreadCount: nextUnread } =
        await fetchNotifications();

      seenIds.current = new Set(next.map((item) => item.id));
      setNotifications(next);
      setUnreadCount(nextUnread);
    } catch {
      // The bell simply stays at whatever it last knew; nothing in the rest
      // of the app depends on notifications loading successfully.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!getToken()) {
      return;
    }

    return subscribeToNotifications((incoming) => {
      if (seenIds.current.has(incoming.id)) {
        return;
      }

      seenIds.current.add(incoming.id);
      setNotifications((current) => [incoming, ...current]);
      setUnreadCount((current) => current + (incoming.read ? 0 : 1));
    });
  }, []);

  const markRead = useCallback(
    async (id: number) => {
      const target = notifications.find((item) => item.id === id);

      if (!target || target.read) {
        return;
      }

      // Read state flips immediately; the request confirms it in the
      // background rather than gating the interaction on a round trip.
      setNotifications((current) =>
        current.map((item) =>
          item.id === id ? { ...item, read: true } : item,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));

      try {
        await markNotificationRead(id);
      } catch {
        // Left optimistically read; the next full load reconciles it.
      }
    },
    [notifications],
  );

  const markAllRead = useCallback(async () => {
    setNotifications((current) =>
      current.map((item) => ({ ...item, read: true })),
    );
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
    } catch {
      // Left optimistically read; the next full load reconciles it.
    }
  }, []);

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, loading, markRead, markAllRead }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
