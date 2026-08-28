import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-yz-ink text-yz-ink-contrast border border-yz-ink hover:opacity-90",
  secondary:
    "bg-yz-panel text-yz-ink border border-yz-neutral-300 hover:border-yz-ink",
  ghost:
    "bg-transparent text-yz-neutral-700 border border-transparent hover:text-yz-ink",
  danger:
    "bg-yz-panel text-yz-danger-ink border border-yz-danger-line hover:bg-yz-danger-bg",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const sizing =
    size === "sm" ? "px-3 py-1.5 text-[12px]" : "px-4 py-2.5 text-[13px]";

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${sizing} ${className}`}
      {...props}
    />
  );
}
