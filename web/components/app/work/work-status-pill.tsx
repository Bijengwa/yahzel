import { StatusPill } from "@/components/ui/status-pill";
import { workStatusLabel, type WorkStatus } from "@/lib/work";

/**
 * not_started reads neutral, blocked reads as a problem, waiting_review and
 * in_progress both read as "in motion, keep an eye on it", done reads
 * resolved — a restrained accent, not a traffic light.
 */
export function WorkStatusPill({ status }: { status: WorkStatus | string }) {
  const tone =
    status === "blocked"
      ? "danger"
      : status === "done"
        ? "ok"
        : status === "not_started"
          ? "muted"
          : "warn";

  return <StatusPill tone={tone}>{workStatusLabel(status)}</StatusPill>;
}
