import { StatusPill } from "@/components/ui/status-pill";
import type { Membership } from "@/lib/organisation";

/**
 * The two facts Yahzel itself asserts about a person, kept visually separate
 * from the title the organisation gave them:
 *
 *   Head  — the organisation's highest-ranking position (a designation).
 *   Admin — what they may do inside Yahzel (an access role).
 *
 * Neither is ever rendered as a job title, and the organisation's own title
 * is never rendered as one of these.
 */
export function StandingPills({ membership }: { membership: Membership }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {membership.isHead && <StatusPill tone="muted">Head</StatusPill>}

      {membership.isAdmin && <StatusPill tone="muted">Admin</StatusPill>}

      {membership.status === "invited" && (
        <StatusPill tone="warn">Invited</StatusPill>
      )}
    </span>
  );
}
