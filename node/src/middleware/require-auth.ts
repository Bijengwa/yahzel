import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

/**
 * The signed-in person's id, resolved from the bearer token and nothing else.
 * No route may read an owner id out of the request body or params — a caller
 * must never be able to name somebody else's row.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization ?? "";

  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    res.status(401).json({ message: "You are not signed in." });
    return;
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error("JWT_SECRET environment variable is required.");
    res
      .status(500)
      .json({ message: "Something went wrong. Please try again." });
    return;
  }

  try {
    const payload = jwt.verify(token, secret);

    const subject =
      typeof payload === "string" ? Number.NaN : Number(payload.sub);

    if (!Number.isInteger(subject)) {
      res.status(401).json({ message: "Your session is no longer valid." });
      return;
    }

    req.userId = subject;
    next();
  } catch {
    res.status(401).json({ message: "Your session has expired. Sign in again." });
  }
}

/**
 * Narrows `req.userId` for handlers that sit behind `requireAuth`. Throwing
 * here is a programming error, not a request error: it means the route was
 * mounted without the middleware.
 */
export function currentUserId(req: Request): number {
  if (typeof req.userId !== "number") {
    throw new Error("currentUserId() called on an unauthenticated route.");
  }

  return req.userId;
}
