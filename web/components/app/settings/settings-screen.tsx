"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { changePassword } from "@/lib/profile";
import { ProfileSection } from "../profile/profile-section";
import {
  MoonIcon,
  SunIcon,
  useTheme,
} from "@/components/theme/theme-provider";
import { LogoutDialog } from "./logout-dialog";

type Status = { tone: "ok" | "error"; message: string } | null;

const EMPTY = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const THEME_OPTIONS = [
  {
    value: "light" as const,
    label: "Light",
    description: "Bright surfaces for daylight.",
    icon: SunIcon,
  },
  {
    value: "dark" as const,
    label: "Dark",
    description: "Warm dark surfaces, easy at night.",
    icon: MoonIcon,
  },
];

function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <ProfileSection
      id="appearance"
      title="Appearance"
      description="Choose how Yahzel looks on this device."
      editing={false}
    >
      <div
        role="radiogroup"
        aria-label="Theme"
        className="flex max-w-xs gap-2"
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
              className={`flex flex-1 items-center gap-2 border px-3 py-2 text-left transition-colors duration-150 ${
                active
                  ? "border-yz-ink bg-yz-neutral-100"
                  : "border-yz-neutral-300 hover:border-yz-ink"
              }`}
            >
              <Icon
                className={active ? "text-yz-ink" : "text-yz-neutral-600"}
              />

              <span className="text-[13px] font-bold text-yz-ink">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </ProfileSection>
  );
}

function PasswordSection() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

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
    <ProfileSection
      id="password"
      title="Password"
      description="You will stay signed in on this device."
      editing={false}
      status={status}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
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

          <Button
            type="submit"
            variant="primary"
            className="mt-1 self-start"
            disabled={saving || !filled}
          >
            {saving ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </ProfileSection>
  );
}

function SessionSection({ onLogoutClick }: { onLogoutClick: () => void }) {
  return (
    <ProfileSection
      id="session"
      title="Session"
      description="Sign out of Yahzel on this device."
      editing={false}
    >
      <Button variant="danger" onClick={onLogoutClick}>
        Log out
      </Button>
    </ProfileSection>
  );
}

export function SettingsScreen() {
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[11px] font-bold tracking-[0.14em] text-yz-accent uppercase">
          Settings
        </p>

        <h1 className="font-brand mt-1 text-[22px] leading-tight font-extrabold tracking-tight text-yz-ink sm:text-[24px]">
          Account
        </h1>

        <p className="mt-1.5 text-[13px] leading-6 text-yz-neutral-600">
          Appearance, sign-in credentials and session for this device. Your
          name, contact details and picture live in Profile.
        </p>
      </header>

      <AppearanceSection />
      <PasswordSection />
      <SessionSection onLogoutClick={() => setLogoutOpen(true)} />

      <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </div>
  );
}
