import type { Request, Response } from "express";
import { AuthError, loginUser, registerUser } from "./auth.service.js";

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
