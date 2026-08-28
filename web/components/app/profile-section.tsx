"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type Status = { tone: "ok" | "error"; message: string } | null;

type ProfileSectionProps = {
  id: string;
  title: string;
  description?: string;
  editing: boolean;
  saving?: boolean;
  dirty?: boolean;
  status?: Status;
  onEdit?: () => void;
  onCancel?: () => void;
  onSave?: () => void;
  children: ReactNode;
};

/**
 * One editable region of the profile. Only the section being edited turns
 * into a form, so the page is never one large uncontrolled form, and the
 * heading always states which mode the reader is in.
 */
export function ProfileSection({
  id,
  title,
  description,
  editing,
  saving = false,
  dirty = false,
  status = null,
  onEdit,
  onCancel,
  onSave,
  children,
}: ProfileSectionProps) {
  return (
    <section
      id={id}
      className="scroll-mt-20 border border-yz-neutral-300 bg-white"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-yz-neutral-200 px-6 py-5 sm:px-8">
        <div>
          <h2 className="font-brand text-[17px] leading-tight font-extrabold tracking-tight text-yz-ink">
            {title}
          </h2>

          {description && (
            <p className="mt-1 text-[13px] leading-6 text-yz-neutral-600">
              {description}
            </p>
          )}
        </div>

        {onEdit && !editing && (
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Edit
          </Button>
        )}

        {editing && (
          <span className="text-[11px] font-bold tracking-[0.12em] text-yz-accent uppercase">
            Editing
          </span>
        )}
      </header>

      <div className="px-6 py-6 sm:px-8">
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

        {children}

        {editing && onSave && onCancel && (
          <div className="mt-7 flex flex-col-reverse gap-2 border-t border-yz-neutral-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
            <span className="mr-auto text-[12px] text-yz-neutral-600">
              {dirty ? "You have unsaved changes." : "No changes yet."}
            </span>

            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>

            <Button
              variant="primary"
              onClick={onSave}
              disabled={saving || !dirty}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/** A read-only label/value pair. */
export function ReadRow({
  label,
  value,
  trailing,
}: {
  label: string;
  value: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-yz-neutral-200 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <dt className="text-[11px] font-bold tracking-[0.12em] text-yz-neutral-600 uppercase">
          {label}
        </dt>

        <dd className="mt-1 text-[14px] break-words text-yz-ink">
          {value ?? (
            <span className="text-yz-neutral-500">Not set</span>
          )}
        </dd>
      </div>

      {trailing && <div className="shrink-0 pt-5">{trailing}</div>}
    </div>
  );
}
