"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { changePassword } from "@/lib/profile";
import {
  MoonIcon,
  SunIcon,
  SystemIcon,
  useTheme,
  type Theme,
} from "@/components/theme/theme-provider";
import { LogoutDialog } from "./logout-dialog";

type Status = { tone: "ok" | "error"; message: string } | null;

const EMPTY = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

/**
 * One labelled group in the settings list — the unit new sections get added
 * as. Keeping this generic (a heading plus whatever rows it holds) means
 * future settings slot in without redesigning the page around them.
 */
function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-yz-neutral-200 py-4 last:border-b-0">
      <h2 className="text-[12px] font-bold text-yz-neutral-600">{title}</h2>

      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/** A single compact row: a label/description on the left, a control on the right. */
function SettingsRow({
  label,
  description,
  trailing,
  children,
}: {
  label: string;
  description?: string;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-yz-ink">{label}</p>

          {description && (
            <p className="mt-0.5 text-[12px] leading-5 text-yz-neutral-600">
              {description}
            </p>
          )}
        </div>

        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>

      {children}
    </div>
  );
}

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof SunIcon }[] =
  [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
    { value: "system", label: "System", icon: SystemIcon },
  ];

function ThemeControl() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-sm border border-yz-neutral-300 p-0.5"
    >
      {THEME_OPTIONS.map((option) => {
        const active = theme === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(option.value)}
            className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[12px] font-semibold transition-colors duration-150 ${
              active
                ? "bg-yz-neutral-200 text-yz-ink"
                : "text-yz-neutral-600 hover:text-yz-ink"
            }`}
          >
            <Icon width={14} height={14} />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PasswordRow() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  const filled =
    form.currentPassword && form.newPassword && form.confirmPassword;

  function update(key: keyof typeof EMPTY, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus(null);
  }

  function close() {
    setOpen(false);
    setForm(EMPTY);
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
    <SettingsRow
      label="Change your password"
      description={
        open ? undefined : "Update the password you use to sign in."
      }
      trailing={
        !open && (
          <Button size="sm" onClick={() => setOpen(true)}>
            Change
          </Button>
        )
      }
    >
      {open && (
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {status && (
            <p
              role="status"
              className={`mb-3 rounded-sm border px-3.5 py-2.5 text-[13px] ${
                status.tone === "ok"
                  ? "border-yz-ok-line bg-yz-ok-bg text-yz-ok-ink"
                  : "border-yz-danger-line bg-yz-danger-bg text-yz-danger-ink"
              }`}
            >
              {status.message}
            </p>
          )}

          <div className="grid max-w-sm gap-3">
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

            <div className="mt-1 flex items-center gap-2">
              <Button type="submit" variant="primary" disabled={saving || !filled}>
                {saving ? "Changing…" : "Change password"}
              </Button>

              <Button variant="ghost" onClick={close} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      )}
    </SettingsRow>
  );
}

export function SettingsScreen() {
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <div className="space-y-3">
      <header>
        <h1 className="font-brand text-[19px] font-extrabold tracking-tight text-yz-ink">
          Settings
        </h1>

        <p className="mt-0.5 text-[12.5px] text-yz-neutral-600">
          Appearance, sign-in credentials and session for this device.
        </p>
      </header>

      <div className="rounded-md border border-yz-neutral-200 bg-yz-panel px-5">
        <SettingsGroup title="Appearance">
          <SettingsRow
            label="Theme"
            description="System follows your device's light/dark setting."
            trailing={<ThemeControl />}
          />
        </SettingsGroup>

        <SettingsGroup title="Password">
          <PasswordRow />
        </SettingsGroup>

        <SettingsGroup title="Log out">
          <SettingsRow
            label="Sign out of Yahzel"
            description="You'll need to sign in again on this device."
            trailing={
              <Button
                variant="danger"
                size="sm"
                onClick={() => setLogoutOpen(true)}
              >
                Log out
              </Button>
            }
          />
        </SettingsGroup>
      </div>

      <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </div>
  );
}
