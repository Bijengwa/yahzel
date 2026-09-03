import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import { subscribe } from "./notification.hub.js";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removeNotification,
} from "./notification.service.js";

function handleFailure(res: Response, error: unknown, context: string): void {
  console.error(`${context}:`, error);

  res.status(500).json({
    message: "Something went wrong. Please try again.",
  });
}

export async function index(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json(await listMyNotifications(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to list notifications");
  }
}

export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).json({ message: "That notification could not be found." });
      return;
    }

    res
      .status(200)
      .json(await markNotificationRead(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to mark a notification read");
  }
}

export async function destroy(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).json({ message: "That notification could not be found." });
      return;
    }

    const result = await removeNotification(currentUserId(req), id);

    if (!result.deleted) {
      res.status(404).json({ message: "That notification could not be found." });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to delete a notification");
  }
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json(await markAllNotificationsRead(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to mark all notifications read");
  }
}

/**
 * The authenticated SSE stream. Held open until the browser disconnects;
 * only ever writes events addressed to the caller's own profile id, which is
 * exactly what makes the earlier auth check load-bearing here.
 */
export function stream(req: Request, res: Response): void {
  const userId = currentUserId(req);

  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  res.flushHeaders();

  // An initial event so the client can tell the connection is actually open
  // rather than still pending.
  res.write("event: connected\ndata: {}\n\n");

  const cleanup = subscribe(userId, res);

  req.on("close", cleanup);
}
