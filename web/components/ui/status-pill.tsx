type Tone = "ok" | "warn" | "danger" | "muted";

const TONES: Record<Tone, string> = {
  ok: "bg-yz-ok-bg text-yz-ok-ink border-yz-ok-line",
  warn: "bg-yz-warn-bg text-yz-warn-ink border-yz-warn-line",
  danger: "bg-yz-danger-bg text-yz-danger-ink border-yz-danger-line",
  muted: "bg-yz-neutral-100 text-yz-neutral-600 border-yz-neutral-300",
};

/** A short, factual state marker: Verified, Not verified, Awaiting code. */
export function StatusPill({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-bold tracking-[0.08em] uppercase ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
