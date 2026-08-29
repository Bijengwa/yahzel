import type { Response } from "express";

/**
 * The in-memory registry behind the SSE stream. One process, one Map — there
 * is exactly one Yahzel API instance, so nothing beyond this is needed to
 * push a freshly created notification to whoever is listening for it.
 *
 * The database row is still the source of truth: a client that was offline
 * when a notification was created simply sees it on its next GET
 * /api/notifications, the same as it always would.
 */

const HEARTBEAT_MS = 25_000;

const connections = new Map<number, Set<Response>>();

function connectionsFor(profileId: number): Set<Response> {
  let set = connections.get(profileId);

  if (!set) {
    set = new Set();
    connections.set(profileId, set);
  }

  return set;
}

/**
 * Registers `res` as an open SSE connection for `profileId` and starts its
 * heartbeat. Returns the cleanup function the route must call once the
 * connection closes — it removes the client and stops the heartbeat, so a
 * disconnected browser never leaks a timer or a Set entry.
 */
export function subscribe(profileId: number, res: Response): () => void {
  const set = connectionsFor(profileId);

  set.add(res);

  const heartbeat = setInterval(() => {
    // A comment line: valid SSE, ignored by EventSource/fetch readers, just
    // enough traffic to keep proxies and browsers from timing the connection
    // out.
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_MS);

  return () => {
    clearInterval(heartbeat);
    set.delete(res);

    if (set.size === 0) {
      connections.delete(profileId);
    }
  };
}

/** Pushes one event to every open connection for that recipient, if any. */
export function publish(
  profileId: number,
  event: string,
  payload: unknown,
): void {
  const set = connections.get(profileId);

  if (!set || set.size === 0) {
    return;
  }

  const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const res of set) {
    res.write(chunk);
  }
}
