"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import {
  cancelEmailChange,
  confirmEmailChange,
  requestEmailChange,
  type Profile,
} from "@/lib/profile";
import { useProfile } from "./profile-provider";

type Message = { tone: "ok" | "error"; text: string } | null;

/**
 * Changing an email never changes who you are signed in as until the new
 * address proves itself. The current address stays verified and active the
 * whole time, and the UI says so at every step.
 */
export function EmailPanel({ profile }: { profile: Profile }) {
  const { applyProfile } = useProfile();

  const [asking, setAsking] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  function fail(caught: unknown, field: string) {
    if (caught instanceof ApiError) {
      setError(caught.forField(field) ?? caught.message);
    } else {
      setError("Something went wrong. Please try again.");
    }
  }

  async function requestChange() {
    setBusy(true);
    setError("");
    setMessage(null);

    try {
      const response = await requestEmailChange(newEmail);
      applyProfile(response.profile);
      setDevCode(response.devOtp ?? null);
      setAsking(false);
      setNewEmail("");
      setMessage({ tone: "ok", text: response.message ?? "" });
    } catch (caught) {
      fail(caught, "email");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError("");

    try {
      const response = await confirmEmailChange(otp);
      applyProfile(response.profile);
      setOtp("");
      setDevCode(null);
      setMessage({
        tone: "ok",
        text: "Your email address has been updated and verified.",
      });
    } catch (caught) {
      fail(caught, "otp");
    } finally {
      setBusy(false);
    }
  }

  async function abandon() {
    setBusy(true);
    setError("");

    try {
      const response = await cancelEmailChange();
      applyProfile(response.profile);
      setOtp("");
      setDevCode(null);
      setMessage({ tone: "ok", text: "Email change cancelled." });
    } catch (caught) {
      fail(caught, "form");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-yz-neutral-200 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.12em] text-yz-neutral-600 uppercase">
            Email
          </p>

          <p className="mt-1 text-[14px] break-all text-yz-ink">
            {profile.email}
          </p>

          <div className="mt-2">
            {profile.emailVerified ? (
              <StatusPill tone="ok">Verified</StatusPill>
            ) : (
              <StatusPill tone="warn">Not verified</StatusPill>
            )}
          </div>
        </div>

        {!profile.pendingEmail && !asking && (
          <Button size="sm" onClick={() => setAsking(true)}>
            Change email
          </Button>
        )}
      </div>

      {message && (
        <p
          role="status"
          className={`mt-3 text-[13px] ${
            message.tone === "ok" ? "text-yz-ok-ink" : "text-yz-danger-ink"
          }`}
        >
          {message.text}
        </p>
      )}

      {asking && (
        <div className="mt-4 border border-yz-neutral-300 bg-yz-neutral-100 p-4">
          <TextField
            id="newEmail"
            type="email"
            label="New email address"
            value={newEmail}
            autoComplete="email"
            error={error}
            hint="Yahzel sends a 6-digit code there. Your current address stays active until you enter it."
            onChange={(event) => {
              setNewEmail(event.target.value);
              setError("");
            }}
          />

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              size="sm"
              onClick={() => {
                setAsking(false);
                setNewEmail("");
                setError("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>

            <Button
              size="sm"
              variant="primary"
              onClick={() => void requestChange()}
              disabled={busy || !newEmail.trim()}
            >
              {busy ? "Sending…" : "Send code"}
            </Button>
          </div>
        </div>
      )}

      {profile.pendingEmail && (
        <div className="mt-4 border border-yz-warn-line bg-yz-warn-bg p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="warn">Awaiting confirmation</StatusPill>

            <p className="text-[13px] break-all text-yz-warn-ink">
              {profile.pendingEmail}
            </p>
          </div>

          <p className="mt-2 text-[13px] leading-6 text-yz-warn-ink/90">
            Enter the code sent to that address to make it your Yahzel email.
            Until you do, {profile.email} stays your verified address.
          </p>

          {devCode && (
            <p className="mt-2 font-mono text-[12px] text-yz-warn-ink">
              Development code: {devCode}
            </p>
          )}

          <div className="mt-4 sm:max-w-[220px]">
            <TextField
              id="emailOtp"
              label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              error={error}
              className="text-center text-[16px] tracking-[0.35em]"
              placeholder="000000"
              onChange={(event) => {
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
                setError("");
              }}
            />
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="sm" onClick={() => void abandon()} disabled={busy}>
              Cancel change
            </Button>

            <Button
              size="sm"
              variant="primary"
              onClick={() => void confirm()}
              disabled={busy || otp.length !== 6}
            >
              {busy ? "Checking…" : "Confirm new email"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
