"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { changePassword } from "@/lib/profile";
import { LogoutDialog } from "./logout-dialog";

type Status = { tone: "ok" | "error"; message: string } | null;

const EMPTY = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export function SettingsScreen() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const filled =
    form.currentPassword && form.newPassword && form.confirmPassword;

  function update(key: keyof typeof EMPTY, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus(null);
  }

  async function submit() {
    if (form.newPassword !== form.confirmPassword) {
      setStatus({ tone: "error", message: "The new passwords do not match." });
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const { message } = await changePassword(form);
      setForm(EMPTY);
      setStatus({ tone: "ok", message });
    } catch (caught) {
      setStatus({
        tone: "error",
        message:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-bold tracking-[0.14em] text-yz-accent uppercase">
          Settings
        </p>

        <h1 className="font-brand mt-1.5 text-[26px] leading-tight font-extrabold tracking-tight text-yz-ink sm:text-[30px]">
          Account
        </h1>

        <p className="mt-2 max-w-xl text-[14px] leading-6 text-yz-neutral-600">
          Your sign-in credentials and session. Your name, contact details and
          picture live in Profile.
        </p>
      </header>

      <section className="border border-yz-neutral-300 bg-white">
        <div className="border-b border-yz-neutral-200 px-6 py-5 sm:px-8">
          <h2 className="font-brand text-[17px] leading-tight font-extrabold tracking-tight text-yz-ink">
            Change password
          </h2>

          <p className="mt-1 text-[13px] leading-6 text-yz-neutral-600">
            You will stay signed in on this device.
          </p>
        </div>

        <form
          className="px-6 py-6 sm:px-8"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {status && (
            <p
              role="status"
              className={`mb-5 border px-4 py-3 text-[13px] ${
                status.tone === "ok"
                  ? "border-yz-ok-line bg-yz-ok-bg text-yz-ok-ink"
                  : "border-yz-danger-line bg-yz-danger-bg text-yz-danger-ink"
              }`}
            >
              {status.message}
            </p>
          )}

          <div className="grid max-w-xl gap-5">
            <TextField
              id="currentPassword"
              type="password"
              label="Current password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(event) =>
                update("currentPassword", event.target.value)
              }
            />

            <TextField
              id="newPassword"
              type="password"
              label="New password"
              autoComplete="new-password"
              hint="At least 8 characters."
              value={form.newPassword}
              onChange={(event) => update("newPassword", event.target.value)}
            />

            <TextField
              id="confirmPassword"
              type="password"
              label="Confirm new password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(event) =>
                update("confirmPassword", event.target.value)
              }
            />
          </div>

          <div className="mt-7 border-t border-yz-neutral-200 pt-5">
            <Button
              type="submit"
              variant="primary"
              disabled={saving || !filled}
            >
              {saving ? "Changing…" : "Change password"}
            </Button>
          </div>
        </form>
      </section>

      <section className="border border-yz-neutral-300 bg-white">
        <div className="border-b border-yz-neutral-200 px-6 py-5 sm:px-8">
          <h2 className="font-brand text-[17px] leading-tight font-extrabold tracking-tight text-yz-ink">
            Session
          </h2>

          <p className="mt-1 text-[13px] leading-6 text-yz-neutral-600">
            Sign out of Yahzel on this device.
          </p>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <Button variant="danger" onClick={() => setLogoutOpen(true)}>
            Log out
          </Button>
        </div>
      </section>

      <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </div>
  );
}
