import { StatusPill } from "@/components/ui/status-pill";
import { projectStatusLabel, type ProjectStatus } from "@/lib/projects";

/**
 * planned reads neutral, active reads as under way, paused reads as a
 * pause (not a problem), completed reads resolved, cancelled reads as a
 * problem/closed — a restrained accent, not a traffic light.
 */
export function ProjectStatusPill({ status }: { status: ProjectStatus | string }) {
  const tone =
    status === "cancelled"
      ? "danger"
      : status === "completed"
        ? "ok"
        : status === "planned"
          ? "muted"
          : "warn";

  return <StatusPill tone={tone}>{projectStatusLabel(status)}</StatusPill>;
}
