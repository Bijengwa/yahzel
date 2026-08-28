"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  removeProfilePicture,
  uploadProfilePicture,
  type Profile,
} from "@/lib/profile";
import { Avatar } from "./avatar";
import { useProfile } from "./profile-provider";

const ACCEPTED = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

export function ProfilePicture({ profile }: { profile: Profile }) {
  const { applyProfile } = useProfile();
  const inputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      setError("Images must be 2 MB or smaller.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const { profile: next } = await uploadProfilePicture(file);
      applyProfile(next);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not upload that image.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");

    try {
      const { profile: next } = await removeProfilePicture();
      applyProfile(next);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not remove your picture.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <Avatar
        fullName={profile.fullName}
        src={profile.profilePictureUrl}
        size={84}
      />

      <div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy
              ? "Working…"
              : profile.profilePictureUrl
                ? "Change picture"
                : "Add picture"}
          </Button>

          {profile.profilePictureUrl && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => void remove()}
              disabled={busy}
            >
              Remove
            </Button>
          )}
        </div>

        <p className="mt-2 text-[12px] leading-5 text-yz-neutral-600">
          {error ? (
            <span className="text-yz-danger-ink">{error}</span>
          ) : (
            "PNG, JPEG or WebP, up to 2 MB."
          )}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";

            if (file) {
              void upload(file);
            }
          }}
        />
      </div>
    </div>
  );
}
