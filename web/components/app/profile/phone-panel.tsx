"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldLabel, TextField } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import { formatPhoneNumber, splitPhoneNumber } from "@/lib/format";
import {
  confirmPhone,
  saveProfile,
  sendPhoneCode,
  type Profile,
} from "@/lib/profile";
import { useCountries } from "./use-countries";
import { useProfile } from "./profile-provider";

export function PhonePanel({ profile }: { profile: Profile }) {
  const { applyProfile } = useProfile();
  const countries = useCountries();

  const stored = splitPhoneNumber(profile.phoneNumber, countries);

  // The country on the profile owns the dial code; the digits the person
  // typed survive a country change untouched.
  const dialCode = profile.dialCode ?? stored.dialCode ?? "";

  const [editing, setEditing] = useState(false);
  const [national, setNational] = useState(stored.nationalNumber);
  const [fallbackDial, setFallbackDial] = useState(stored.dialCode ?? "");
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const activeDial = dialCode || fallbackDial;

  const codeChanged = Boolean(
    stored.dialCode && dialCode && stored.dialCode !== dialCode,
  );

  function fail(caught: unknown, field: string) {
    setError(
      caught instanceof ApiError
        ? (caught.forField(field) ?? caught.message)
        : "Something went wrong. Please try again.",
    );
  }

  function startEditing() {
    const current = splitPhoneNumber(profile.phoneNumber, countries);

    setNational(current.nationalNumber);
    setFallbackDial(current.dialCode ?? "");
    setError("");
    setMessage("");
    setEditing(true);
  }

  async function savePhone() {
    setBusy(true);
    setError("");

    try {
      const digits = national.replace(/\D/g, "");

      const { profile: next } = await saveProfile({
        phoneNumber: digits ? `${activeDial}${digits}` : null,
      });

      applyProfile(next);
      setEditing(false);
      setVerifying(false);
      setDevCode(null);
      setMessage(
        digits
          ? "Phone number saved. Verify it to complete your profile."
          : "Phone number removed.",
      );
    } catch (caught) {
      fail(caught, "phoneNumber");
    } finally {
      setBusy(false);
    }
  }

  async function requestCode() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await sendPhoneCode();

      setDevCode(response.devOtp ?? null);
      setVerifying(true);
      setMessage(response.message);
    } catch (caught) {
      fail(caught, "phoneNumber");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError("");

    try {
      const response = await confirmPhone(otp);

      applyProfile(response.profile);
      setVerifying(false);
      setOtp("");
      setDevCode(null);
      setMessage("Your phone number has been verified.");
    } catch (caught) {
      fail(caught, "otp");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-yz-neutral-200 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.12em] text-yz-neutral-600 uppercase">
            Phone number
          </p>

          <p className="mt-1 text-[14px] text-yz-ink">
            {formatPhoneNumber(profile.phoneNumber, countries) ?? (
              <span className="text-yz-neutral-500">Not set</span>
            )}
          </p>

          {profile.phoneNumber && (
            <div className="mt-2">
              {profile.phoneVerified ? (
                <StatusPill tone="ok">Verified</StatusPill>
              ) : (
                <StatusPill tone="warn">Not verified</StatusPill>
              )}
            </div>
          )}
        </div>

        {!editing && (
          <div className="flex gap-2">
            {profile.phoneNumber && !profile.phoneVerified && !verifying && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => void requestCode()}
                disabled={busy}
              >
                {busy ? "Sending…" : "Verify"}
              </Button>
            )}

            <Button size="sm" onClick={startEditing}>
              {profile.phoneNumber ? "Edit" : "Add phone"}
            </Button>
          </div>
        )}
      </div>

      {message && !error && (
        <p role="status" className="mt-3 text-[13px] text-yz-ok-ink">
          {message}
        </p>
      )}

      {error && !editing && (
        <p role="alert" className="mt-3 text-[13px] text-yz-danger-ink">
          {error}
        </p>
      )}

      {editing && (
        <div className="mt-4 border border-yz-neutral-300 bg-yz-neutral-100 p-4">
          <FieldLabel htmlFor="phoneNational">Phone number</FieldLabel>

          <div className="flex">
            {dialCode ? (
              <span className="flex items-center border border-r-0 border-yz-neutral-300 bg-white px-3 font-mono text-[14px] text-yz-neutral-700">
                {dialCode}
              </span>
            ) : (
              <select
                aria-label="Country code"
                value={fallbackDial}
                onChange={(event) => setFallbackDial(event.target.value)}
                className="border border-r-0 border-yz-neutral-300 bg-white px-2 font-mono text-[14px] text-yz-neutral-700 outline-none"
              >
                <option value="">Code</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.dialCode}>
                    {country.dialCode} {country.code}
                  </option>
                ))}
              </select>
            )}

            <input
              id="phoneNational"
              inputMode="tel"
              autoComplete="tel-national"
              value={national}
              placeholder="712 345 678"
              onChange={(event) => {
                setNational(event.target.value.replace(/[^\d\s]/g, ""));
                setError("");
              }}
              className="w-full border border-yz-neutral-300 bg-white px-3 py-2.5 text-[14px] text-yz-ink outline-none transition-colors duration-150 focus:border-yz-ink"
            />
          </div>

          {error ? (
            <p className="mt-1.5 text-[12px] leading-5 text-yz-danger-ink">
              {error}
            </p>
          ) : (
            <p className="mt-1.5 text-[12px] leading-5 text-yz-neutral-600">
              {codeChanged
                ? `Your country is ${profile.countryName}, so this number will be saved with ${dialCode}. The digits you entered are unchanged.`
                : dialCode
                  ? `The code comes from your country, ${profile.countryName}. Change your country to use a different one.`
                  : "Set your country in Personal information to fix the code automatically."}
            </p>
          )}

          <p className="mt-3 text-[12px] leading-5 text-yz-neutral-600">
            Changing your number clears its verified status.
          </p>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              size="sm"
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>

            <Button
              size="sm"
              variant="primary"
              onClick={() => void savePhone()}
              disabled={busy || (!activeDial && Boolean(national.trim()))}
            >
              {busy ? "Saving…" : "Save phone number"}
            </Button>
          </div>
        </div>
      )}

      {verifying && !editing && (
        <div className="mt-4 border border-yz-neutral-300 bg-yz-neutral-100 p-4">
          <p className="text-[13px] leading-6 text-yz-neutral-700">
            Enter the 6-digit code sent to{" "}
            {formatPhoneNumber(profile.phoneNumber, countries)}.
          </p>

          {devCode && (
            <p className="mt-2 font-mono text-[12px] text-yz-neutral-700">
              Development code: {devCode}
            </p>
          )}

          <div className="mt-3 sm:max-w-[220px]">
            <TextField
              id="phoneOtp"
              label="Verification code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              error={error}
              placeholder="000000"
              className="text-center text-[16px] tracking-[0.35em]"
              onChange={(event) => {
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
                setError("");
              }}
            />
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              size="sm"
              onClick={() => {
                setVerifying(false);
                setOtp("");
                setError("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>

            <Button
              size="sm"
              variant="primary"
              onClick={() => void submitCode()}
              disabled={busy || otp.length !== 6}
            >
              {busy ? "Checking…" : "Verify phone number"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
