import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Development-safe profile picture storage.
 *
 * Yahzel has no object storage yet, so uploads are written to a folder on the
 * API host and served back as static files. Two rules keep this honest: the
 * database only ever holds the *path*, never the bytes, and the public path
 * shape (`/uploads/avatars/<id>.<ext>`) is the same shape a CDN URL will have,
 * so swapping this module for real storage later touches nothing else.
 */

export const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

const AVATAR_DIR = path.join(UPLOAD_ROOT, "avatars");

export const AVATAR_PUBLIC_PREFIX = "/uploads/avatars";

/** 2 MB. Large enough for a photograph, small enough to keep the disk sane. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const ACCEPTED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const ACCEPTED_MIME_TYPES = Object.keys(ACCEPTED_IMAGE_TYPES);

function normaliseMime(contentType: string | undefined): string {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAcceptedImageType(contentType: string | undefined): boolean {
  return normaliseMime(contentType) in ACCEPTED_IMAGE_TYPES;
}

export async function saveAvatar(
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const extension = ACCEPTED_IMAGE_TYPES[normaliseMime(contentType)];

  if (!extension) {
    throw new Error(`Unsupported image type: ${normaliseMime(contentType)}`);
  }

  await mkdir(AVATAR_DIR, { recursive: true });

  const fileName = `${randomUUID()}.${extension}`;

  await writeFile(path.join(AVATAR_DIR, fileName), bytes);

  return `${AVATAR_PUBLIC_PREFIX}/${fileName}`;
}

/**
 * Best-effort cleanup of a replaced or removed picture. A file that is already
 * gone is not worth failing the request over, but anything else is worth
 * knowing about in the log.
 */
export async function deleteAvatar(publicPath: string | null): Promise<void> {
  if (!publicPath || !publicPath.startsWith(`${AVATAR_PUBLIC_PREFIX}/`)) {
    return;
  }

  const fileName = path.basename(publicPath);

  try {
    await unlink(path.join(AVATAR_DIR, fileName));
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code !== "ENOENT") {
      console.error("Could not remove profile picture:", error);
    }
  }
}
