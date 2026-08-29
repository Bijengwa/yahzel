import { API_URL, apiRequest } from "./api";
import { getToken } from "./session";

/* ------------------------------------------------------------------------
   Shapes, mirroring what node/src/notifications serialises
   --------------------------------------------------------------------- */

export type YzNotification = {
  id: number;
  type: string;
  message: string;
  organisationId: number | null;
  invitationId: number | null;
  actionUrl: string | null;
  read: boolean;
  createdAt: string;
};

/* ------------------------------------------------------------------------
   Calls
   --------------------------------------------------------------------- */

export function fetchNotifications(): Promise<{
  notifications: YzNotification[];
  unreadCount: number;
}> {
  return apiRequest("/api/notifications");
}

export function markNotificationRead(
  id: number,
): Promise<{ notification: YzNotification | null; unreadCount: number }> {
  return apiRequest(`/api/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<{ unreadCount: number }> {
  return apiRequest("/api/notifications/read-all", { method: "POST" });
}

/* ------------------------------------------------------------------------
   Live stream
   --------------------------------------------------------------------- */

/**
 * A fetch-based SSE reader rather than the browser's EventSource: the
 * stream is authenticated with the same bearer token every other Yahzel
 * request uses, and EventSource has no way to attach an Authorization
 * header (only a URL, which would put the token in plain sight in logs and
 * browser history).
 *
 * Reconnects automatically with a capped exponential backoff. Returns a
 * function that stops it for good — call it on unmount.
 */
export function subscribeToNotifications(
  onNotification: (notification: YzNotification) => void,
): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let retryDelay = 1000;
  const maxRetryDelay = 30_000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  async function connect() {
    if (stopped) {
      return;
    }

    const token = getToken();

    if (!token) {
      return;
    }

    controller = new AbortController();

    try {
      const response = await fetch(`${API_URL}/api/notifications/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream responded with ${response.status}`);
      }

      // A successful connection resets the backoff for the next drop.
      retryDelay = 1000;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const raw of events) {
          const dataLine = raw
            .split("\n")
            .find((line) => line.startsWith("data:"));

          if (!dataLine) {
            continue;
          }

          const eventLine = raw
            .split("\n")
            .find((line) => line.startsWith("event:"));

          const eventName = eventLine?.slice("event:".length).trim();

          if (eventName !== "notification") {
            continue;
          }

          try {
            onNotification(JSON.parse(dataLine.slice("data:".length).trim()));
          } catch {
            // A malformed event is dropped rather than crashing the stream.
          }
        }
      }
    } catch {
      // Network drop, abort, or a non-2xx response — all handled the same
      // way below: retry with backoff.
    }

    if (!stopped) {
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
        void connect();
      }, retryDelay);
    }
  }

  void connect();

  return () => {
    stopped = true;
    controller?.abort();

    if (retryTimer) {
      clearTimeout(retryTimer);
    }
  };
}

/* ------------------------------------------------------------------------
   Wording
   --------------------------------------------------------------------- */

/** "Just now", "2 min ago", "5 hr ago", or a short date once it is old. */
export function describeRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 45) {
    return "Just now";
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.round(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
