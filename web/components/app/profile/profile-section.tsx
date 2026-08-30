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
      className="scroll-mt-20 border-b border-yz-neutral-200 py-4 last:border-b-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-bold text-yz-ink">{title}</h2>

          {description && (
            <p className="mt-0.5 max-w-md text-[12.5px] leading-5 text-yz-neutral-600">
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
          <span className="text-[11px] font-bold tracking-[0.08em] text-yz-accent uppercase">
            Editing
          </span>
        )}
      </div>

      <div className="mt-3">
        {status && (
          <p
            role="status"
            className={`mb-3 rounded-lg border px-3.5 py-2.5 text-[13px] ${
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
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
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
    <div className="grid grid-cols-1 gap-1 border-b border-yz-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[148px_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <dt className="text-[12px] font-medium text-yz-neutral-500">{label}</dt>

      <dd className="min-w-0 text-[14px] font-medium break-words text-yz-ink">
        {value ?? <span className="font-normal text-yz-neutral-500">Not set</span>}
      </dd>

      {trailing ? <div className="shrink-0 sm:justify-self-end">{trailing}</div> : null}
    </div>
  );
}
