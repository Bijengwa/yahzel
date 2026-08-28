import type { ProfileCompletion } from "@/lib/profile";

/**
 * Yahzel shows profile completion as a ledger, not a progress bar: one
 * segment per required field, filled or hollow. The reader can count what is
 * outstanding at a glance, and the shape is honest — six segments because
 * there are six requirements, not an arbitrary rounded percentage.
 */
export function CompletionMeter({
  completion,
  className = "",
}: {
  completion: ProfileCompletion;
  className?: string;
}) {
  return (
    <div className={`flex gap-1 ${className}`} aria-hidden="true">
      {completion.items.map((item) => (
        <span
          key={item.key}
          title={item.label}
          className={`h-2 flex-1 border transition-colors duration-300 ${
            item.complete
              ? "border-yz-ink bg-yz-ink"
              : "border-yz-neutral-400 bg-transparent"
          }`}
        />
      ))}
    </div>
  );
}

export function CompletionSummary({
  completion,
  className = "",
}: {
  completion: ProfileCompletion;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold tracking-[0.12em] text-yz-neutral-600 uppercase">
          Profile complete
        </span>

        <span className="font-mono text-[13px] font-medium text-yz-ink tabular-nums">
          {completion.percent}%
        </span>
      </div>

      <CompletionMeter completion={completion} className="mt-2" />

      <p className="mt-2 text-[12px] text-yz-neutral-600">
        {completion.isComplete
          ? "Everything Yahzel needs is on file."
          : `${completion.completed} of ${completion.total} details on file.`}
      </p>
    </div>
  );
}

/** The same ledger, itemised — used on Profile where the reader can act. */
export function CompletionChecklist({
  completion,
}: {
  completion: ProfileCompletion;
}) {
  return (
    <ul className="mt-4 space-y-2">
      {completion.items.map((item) => (
        <li key={item.key} className="flex items-center gap-2.5 text-[13px]">
          <span
            aria-hidden="true"
            className={`flex h-4 w-4 shrink-0 items-center justify-center border text-[10px] font-bold ${
              item.complete
                ? "border-yz-ink bg-yz-ink text-yz-ink-contrast"
                : "border-yz-neutral-400 text-transparent"
            }`}
          >
            {item.complete ? "✓" : ""}
          </span>

          <span
            className={
              item.complete ? "text-yz-neutral-600" : "font-semibold text-yz-ink"
            }
          >
            {item.label}
          </span>

          <span className="sr-only">
            {item.complete ? "complete" : "still needed"}
          </span>
        </li>
      ))}
    </ul>
  );
}
