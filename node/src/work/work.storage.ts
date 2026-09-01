import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { UPLOAD_ROOT } from "../profile/profile.storage.js";

/**
 * Development-safe storage for Work Report evidence, mirroring
 * profile.storage.ts.
 *
 * Yahzel has no object storage yet, so uploads are written to a folder on the
 * API host and served back as static files by the same `/uploads` middleware
 * that serves avatars. Two rules keep this honest: the database only ever holds
 * the *path*, never the bytes, and the public path shape
 * (`/uploads/work/<uuid>.<ext>`) is the same shape a CDN URL will have, so
 * swapping this module for real storage later touches nothing else.
 */

const WORK_DIR = path.join(UPLOAD_ROOT, "work");

export const WORK_PUBLIC_PREFIX = "/uploads/work";

/** 15 MB — comfortably fits a scanned document or a screenshot. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/**
 * A pragmatic allowlist: the images the app already accepts, plus the common
 * document types evidence tends to arrive as. Value is the file extension.
 */
const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export const ACCEPTED_ATTACHMENT_MIME_TYPES = Object.keys(ACCEPTED_TYPES);

function normaliseMime(contentType: string | undefined): string {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAcceptedAttachmentType(
  contentType: string | undefined,
): boolean {
  return normaliseMime(contentType) in ACCEPTED_TYPES;
}

export async function saveAttachment(
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const extension = ACCEPTED_TYPES[normaliseMime(contentType)];

  if (!extension) {
    throw new Error(`Unsupported attachment type: ${normaliseMime(contentType)}`);
  }

  await mkdir(WORK_DIR, { recursive: true });

  const fileName = `${randomUUID()}.${extension}`;

  await writeFile(path.join(WORK_DIR, fileName), bytes);

  return `${WORK_PUBLIC_PREFIX}/${fileName}`;
}

/**
 * Best-effort cleanup of a stored file — used if the database row that should
 * accompany it could not be written. A file that is already gone is not worth
 * failing over; anything else is worth a line in the log.
 */
export async function deleteAttachment(publicPath: string | null): Promise<void> {
  if (!publicPath || !publicPath.startsWith(`${WORK_PUBLIC_PREFIX}/`)) {
    return;
  }

  const fileName = path.basename(publicPath);

  try {
    await unlink(path.join(WORK_DIR, fileName));
  } catch (error) {
    const code = (error as { code?: string }).code;

    if (code !== "ENOENT") {
      console.error("Could not remove work attachment:", error);
    }
  }
}
