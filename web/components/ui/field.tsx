"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const CONTROL =
  "w-full border bg-white px-3 py-2.5 text-[14px] text-yz-ink outline-none transition-colors duration-150 disabled:bg-yz-neutral-100 disabled:text-yz-neutral-600";

function borderFor(error?: string): string {
  return error
    ? "border-yz-danger-line focus:border-yz-danger-ink"
    : "border-yz-neutral-300 focus:border-yz-ink";
}

export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-bold tracking-[0.12em] text-yz-neutral-600 uppercase"
    >
      {children}
    </label>
  );
}

function Message({ error, hint }: { error?: string; hint?: ReactNode }) {
  if (error) {
    return (
      <p className="mt-1.5 text-[12px] leading-5 text-yz-danger-ink">{error}</p>
    );
  }

  if (hint) {
    return (
      <p className="mt-1.5 text-[12px] leading-5 text-yz-neutral-600">{hint}</p>
    );
  }

  return null;
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
};

export function TextField({
  label,
  error,
  hint,
  id,
  className = "",
  ...props
}: TextFieldProps) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>

      <input
        id={id}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL} ${borderFor(error)} ${className}`}
        {...props}
      />

      <Message error={error} hint={hint} />
    </div>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
};

export function SelectField({
  label,
  error,
  hint,
  id,
  children,
  className = "",
  ...props
}: SelectFieldProps) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>

      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL} ${borderFor(error)} appearance-none bg-[length:10px] bg-[right_0.9rem_center] bg-no-repeat pr-9 ${className}`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23605d5d'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        {children}
      </select>

      <Message error={error} hint={hint} />
    </div>
  );
}
