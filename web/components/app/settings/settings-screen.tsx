"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import {
  PageHeader,
  Panel,
  PanelGroup,
  PanelRow,
  StatusMessage,
} from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { changePassword } from "@/lib/profile";
import { ThemeSwitch } from "@/components/theme/theme-provider";
import { WorkSettingsScreen } from "../work/work-settings-screen";
import { LogoutDialog } from "./logout-dialog";
import { OrganizationSettingsPanel } from "./organization-settings-panel";

type Status = { tone: "ok" | "error"; message: string } | null;

const EMPTY = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

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
    <PanelRow
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
            <StatusMessage tone={status.tone} className="mb-3">
              {status.message}
            </StatusMessage>
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
    </PanelRow>
  );
}

const TABS = [
  { value: "account", label: "Account" },
  { value: "organization", label: "Organization" },
  { value: "work", label: "Work" },
] as const;

type Tab = (typeof TABS)[number]["value"];

function AccountTab({ onLogout }: { onLogout: () => void }) {
  return (
    <Panel>
      <PanelGroup title="Appearance">
        <PanelRow
          label="Theme"
          description="System follows your device's light/dark setting."
          trailing={<ThemeSwitch />}
        />
      </PanelGroup>

      <PanelGroup title="Password">
        <PasswordRow />
      </PanelGroup>

      <PanelGroup title="Log out">
        <PanelRow
          label="Sign out of Yahzel"
          description="You'll need to sign in again on this device."
          trailing={
            <Button variant="danger" size="sm" onClick={onLogout}>
              Log out
            </Button>
          }
        />
      </PanelGroup>
    </Panel>
  );
}

/**
 * One coherent Settings area: Account (this device's theme, credentials,
 * session), Organization (name/type/country/description — admin only), and
 * Work (Phase 4's overdue/stalled thresholds, unchanged, just reachable from
 * here too rather than only from Work's own nav). Hiring, People/HR and
 * Advanced are not shown: nothing in Yahzel today is actually configurable
 * under those headings, and an empty tab would be a placeholder page.
 */
export function SettingsScreen() {
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("account");

  return (
    <div className="space-y-3">
      <PageHeader
        title="Settings"
        description="Account, organisation and work configuration in one place."
      />

      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex items-center gap-1 border-b border-yz-neutral-200"
      >
        {TABS.map((option) => {
          const active = tab === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(option.value)}
              className={`-mb-px border-b-2 px-2.5 py-2 text-[13px] font-semibold transition-colors duration-150 ${
                active
                  ? "border-yz-accent text-yz-ink"
                  : "border-transparent text-yz-neutral-600 hover:text-yz-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {tab === "account" && <AccountTab onLogout={() => setLogoutOpen(true)} />}
      {tab === "organization" && <OrganizationSettingsPanel />}
      {tab === "work" && <WorkSettingsScreen />}

      <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} />
    </div>
  );
}
