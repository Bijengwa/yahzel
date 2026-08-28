import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import {
  ProfileError,
  cancelEmailChange,
  clearProfilePicture,
  getProfile,
  patchProfile,
  requestEmailChange,
  sendPhoneCode,
  setProfilePicture,
  verifyEmailChange,
  verifyPhone,
} from "./profile.service.js";
import {
  MAX_AVATAR_BYTES,
  deleteAvatar,
  isAcceptedImageType,
  saveAvatar,
} from "./profile.storage.js";

/**
 * One place where a thrown error becomes a response. Anything that is not a
 * deliberate `ProfileError` is logged and answered with a generic message, so
 * database details never reach the browser.
 */
function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof ProfileError) {
    res.status(error.status).json({
      message: error.message,
      errors: error.errors,
    });
    return;
  }

  console.error(`${context}:`, error);

  res.status(500).json({
    message: "Something went wrong. Please try again.",
    errors: [],
  });
}

export async function show(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json({ profile: await getProfile(currentUserId(req)) });
  } catch (error) {
    handleFailure(res, error, "Failed to load profile");
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const profile = await patchProfile(currentUserId(req), req.body ?? {});

    res.status(200).json({ message: "Changes saved.", profile });
  } catch (error) {
    handleFailure(res, error, "Failed to update profile");
  }
}

export async function startEmailChange(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = await requestEmailChange(currentUserId(req), req.body?.email);

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to start email change");
  }
}

export async function confirmEmailChange(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const result = await verifyEmailChange(currentUserId(req), req.body?.otp);

    res.status(200).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to confirm email change");
  }
}

export async function abandonEmailChange(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    res.status(200).json(await cancelEmailChange(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to cancel email change");
  }
}

export async function requestPhoneCode(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    res.status(200).json(await sendPhoneCode(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to send phone code");
  }
}

export async function confirmPhone(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json(await verifyPhone(currentUserId(req), req.body?.otp));
  } catch (error) {
    handleFailure(res, error, "Failed to verify phone number");
  }
}

/**
 * The image arrives as the raw request body with an image content type, so
 * there is no multipart parser and no base64 round-trip.
 */
export async function uploadPicture(req: Request, res: Response): Promise<void> {
  try {
    const contentType = req.headers["content-type"];

    if (!isAcceptedImageType(contentType)) {
      res.status(415).json({
        message: "Upload a PNG, JPEG or WebP image.",
        errors: [
          {
            field: "profilePicture",
            message: "Upload a PNG, JPEG or WebP image.",
          },
        ],
      });
      return;
    }

    const bytes: unknown = req.body;

    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      res.status(400).json({
        message: "No image was received.",
        errors: [{ field: "profilePicture", message: "No image was received." }],
      });
      return;
    }

    if (bytes.length > MAX_AVATAR_BYTES) {
      res.status(413).json({
        message: "Images must be 2 MB or smaller.",
        errors: [
          {
            field: "profilePicture",
            message: "Images must be 2 MB or smaller.",
          },
        ],
      });
      return;
    }

    const publicPath = await saveAvatar(bytes, String(contentType));

    const result = await setProfilePicture(currentUserId(req), publicPath);

    await deleteAvatar(result.replacedPath);

    res.status(200).json({
      message: result.message,
      profile: result.profile,
    });
  } catch (error) {
    handleFailure(res, error, "Failed to upload profile picture");
  }
}

export async function removePicture(req: Request, res: Response): Promise<void> {
  try {
    const result = await clearProfilePicture(currentUserId(req));

    await deleteAvatar(result.removedPath);

    res.status(200).json({
      message: result.message,
      profile: result.profile,
    });
  } catch (error) {
    handleFailure(res, error, "Failed to remove profile picture");
  }
}
