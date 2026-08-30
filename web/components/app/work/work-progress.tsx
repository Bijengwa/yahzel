/** A thin filled bar plus the percentage, for a Work Item's progress. */
export function WorkProgress({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-16 overflow-hidden rounded-full bg-yz-neutral-200"
      >
        <span
          className="block h-full rounded-full bg-yz-ink"
          style={{ width: `${clamped}%` }}
        />
      </span>

      <span className="w-8 shrink-0 text-[12px] tabular-nums text-yz-neutral-700">
        {clamped}%
      </span>
    </span>
  );
}
