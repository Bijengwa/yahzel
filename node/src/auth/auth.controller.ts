import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import {
  AuthError,
  changePassword,
  loginUser,
  registerUser,
  resendVerificationCode,
  verifyUserEmail,
} from "./auth.service.js";

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const result = await registerUser(req.body ?? {});
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    console.error("Failed to register user:", error);
    res
      .status(500)
      .json({ message: "Something went wrong. Please try again." });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const result = await loginUser(req.body ?? {});
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    console.error("Failed to log in user:", error);
    res
      .status(500)
      .json({ message: "Something went wrong. Please try again." });
  }
}

export async function verify(req: Request, res: Response): Promise<void> {
  try {
    const userId = Number(req.body?.userId);
    const otp = String(req.body?.otp ?? "").trim();

    if (!Number.isInteger(userId) || !otp) {
      res
        .status(400)
        .json({ message: "User ID and verification code are required." });
      return;
    }

    const result = await verifyUserEmail(userId, otp);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    console.error("Failed to verify email:", error);
    res
      .status(500)
      .json({ message: "Something went wrong. Please try again." });
  }
}

export async function resendVerification(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = Number(req.body?.userId);

    if (!Number.isInteger(userId)) {
      res.status(400).json({ message: "User ID is required." });
      return;
    }

    const result = await resendVerificationCode(userId);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    console.error("Failed to resend verification code:", error);
    res
      .status(500)
      .json({ message: "Something went wrong. Please try again." });
  }
}

export async function updatePassword(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = await changePassword(currentUserId(req), req.body ?? {});

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    console.error("Failed to change password:", error);
    res
      .status(500)
      .json({ message: "Something went wrong. Please try again." });
  }
}
