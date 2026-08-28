"use client";

import { useEffect, useRef, type ReactNode } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

/**
 * A small dialog for decisions that deserve a pause. It closes on Escape and
 * on the backdrop, moves focus inside on open, and returns focus to whatever
 * opened it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    openerRef.current = document.activeElement as HTMLElement | null;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      openerRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="yz-modal-title"
        tabIndex={-1}
        className="w-full max-w-sm border border-yz-neutral-300 bg-yz-panel p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)] outline-none"
      >
        <h2
          id="yz-modal-title"
          className="font-brand text-[17px] leading-tight font-extrabold tracking-tight text-yz-ink"
        >
          {title}
        </h2>

        {description && (
          <div className="mt-2 text-[13px] leading-6 text-yz-neutral-700">
            {description}
          </div>
        )}

        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
