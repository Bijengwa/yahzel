import type { ReactNode } from "react";

/**
 * Shared page furniture. Keep width, rhythm and surface treatment here so
 * Settings, Profile and Organisation do not invent their own spacing.
 */

const WIDTH = {
  narrow: "max-w-[640px]",
  default: "max-w-[760px]",
  wide: "max-w-[960px]",
} as const;

export function PageFrame({
  children,
  width = "default",
  className = "",
}: {
  children: ReactNode;
  width?: keyof typeof WIDTH;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full ${WIDTH[width]} space-y-5 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-brand text-[22px] leading-none font-extrabold tracking-tight text-yz-ink">
          {title}
        </h1>

        {description && (
          <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-yz-neutral-600">
            {description}
          </p>
        )}
      </div>

      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[12px] border border-yz-neutral-200 bg-yz-panel px-4 shadow-[var(--yz-shadow)] sm:px-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function PanelGroup({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-yz-neutral-200 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold tracking-[0.08em] text-yz-neutral-500 uppercase">
          {title}
        </h2>

        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>

      <div className="mt-3">{children}</div>
    </div>
  );
}

export function PanelRow({
  label,
  description,
  trailing,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-yz-ink">{label}</div>

          {description && (
            <div className="mt-0.5 text-[12.5px] leading-5 text-yz-neutral-600">
              {description}
            </div>
          )}
        </div>

        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>

      {children}
    </div>
  );
}

export function StatusMessage({
  tone,
  children,
  className = "",
}: {
  tone: "ok" | "error";
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={`rounded-lg border px-3.5 py-2.5 text-[13px] ${
        tone === "ok"
          ? "border-yz-ok-line bg-yz-ok-bg text-yz-ok-ink"
          : "border-yz-danger-line bg-yz-danger-bg text-yz-danger-ink"
      } ${className}`}
    >
      {children}
    </p>
  );
}
