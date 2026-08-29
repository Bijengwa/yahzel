import { StatusPill } from "@/components/ui/status-pill";
import type { Membership } from "@/lib/organisation";

/**
 * The facts Yahzel itself asserts about a person, kept visually separate from
 * the title the organisation gave them:
 *
 *   Head           — the highest-ranking position, inside Administration.
 *   Administration — the organisation's leadership class.
 *   Admin          — what they may do inside Yahzel: an access role.
 *
 * Admin and Administration are different pills on purpose. Neither is ever
 * rendered as a job title, and the organisation's own title is never rendered
 * as one of these.
 */
export function StandingPills({ membership }: { membership: Membership }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {membership.isHead && <StatusPill tone="muted">Head</StatusPill>}

      {membership.isAdministration && !membership.isHead && (
        <StatusPill tone="muted">Administration</StatusPill>
      )}

      {membership.isAdmin && <StatusPill tone="warn">Admin</StatusPill>}
    </span>
  );
}
