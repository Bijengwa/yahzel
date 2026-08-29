import type { ReactNode } from "react";

/**
 * The page furniture every area of the authenticated app is built from.
 *
 * Settings established this shape — a titled group of compact rows inside one
 * bordered panel — and Organisation reuses it rather than inventing a second
 * card system. Anything that needs a new kind of row should add it here.
 */

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
        <h1 className="font-brand text-[19px] font-extrabold tracking-tight text-yz-ink">
          {title}
        </h1>

        {description && (
          <p className="mt-0.5 text-[12.5px] text-yz-neutral-600">
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
      className={`rounded-md border border-yz-neutral-200 bg-yz-panel px-5 ${className}`}
    >
      {children}
    </div>
  );
}

/** One labelled group inside a panel. New sections slot in beside it. */
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
        <h2 className="text-[12px] font-bold text-yz-neutral-600">{title}</h2>

        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>

      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/** A compact row: a label and description on the left, a control on the right. */
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-yz-ink">{label}</div>

          {description && (
            <div className="mt-0.5 text-[12px] leading-5 text-yz-neutral-600">
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

/** The one way an action reports how it went. */
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
      className={`rounded-sm border px-3.5 py-2.5 text-[13px] ${
        tone === "ok"
          ? "border-yz-ok-line bg-yz-ok-bg text-yz-ok-ink"
          : "border-yz-danger-line bg-yz-danger-bg text-yz-danger-ink"
      } ${className}`}
    >
      {children}
    </p>
  );
}
