"use client";

import type { ReactNode } from "react";

import { ThemeSwitch } from "@/components/theme/theme-provider";
import { YahzelIcon } from "@/components/yahzel-icon";

/**
 * The frame every authentication screen sits in.
 *
 * Deliberately unboxed: there is no card border around the form, so the
 * content floats on the page ground instead of looking like a dialog dropped
 * onto it. The mark is drawn in `currentColor`, which means it stays visible
 * in both themes rather than disappearing into a dark surface.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-yz-bg px-5 py-5 text-yz-ink">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <YahzelIcon
            size={22}
            className="text-yz-ink"
            title={null}
            maskId="yz-auth-mark"
          />

          <span className="font-brand text-[15px] font-extrabold tracking-tight text-yz-ink">
            Yahzel
          </span>
        </span>

        {/* System by default: Yahzel follows the operating system until the
            person says otherwise. */}
        <ThemeSwitch compact />
      </div>

      <div className="flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-sm">
          <h1 className="font-brand text-[24px] leading-tight font-extrabold tracking-tight text-yz-ink">
            {title}
          </h1>

          {description && (
            <p className="mt-1.5 text-[13px] leading-6 text-yz-neutral-600">
              {description}
            </p>
          )}

          <div className="mt-6">{children}</div>

          {footer && (
            <div className="mt-6 border-t border-yz-neutral-200 pt-4 text-center text-[13px] text-yz-neutral-600">
              {footer}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** The one way an authentication screen reports a problem or a result. */
export function AuthMessage({
  tone,
  children,
}: {
  tone: "ok" | "error";
  children: ReactNode;
}) {
  return (
    <p
      role="status"
      className={`mb-4 rounded-sm border px-3.5 py-2.5 text-[13px] ${
        tone === "ok"
          ? "border-yz-ok-line bg-yz-ok-bg text-yz-ok-ink"
          : "border-yz-danger-line bg-yz-danger-bg text-yz-danger-ink"
      }`}
    >
      {children}
    </p>
  );
}

/** The primary action of an authentication form. */
export function AuthSubmit({
  loading,
  children,
  loadingLabel,
}: {
  loading: boolean;
  children: ReactNode;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-sm bg-yz-ink px-4 py-2.5 text-[13px] font-bold text-yz-ink-contrast transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? loadingLabel : children}
    </button>
  );
}
