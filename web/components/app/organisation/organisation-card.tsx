import Link from "next/link";

import { StatusPill } from "@/components/ui/status-pill";
import {
  describePlacement,
  describeTimeline,
  statusLabel,
  type Participation,
} from "@/lib/organisation";

/**
 * ACTIVE reads green, CONCLUDED red, anything in between stays neutral — a
 * restrained accent, not a traffic light.
 */
export function MembershipStatusPill({ status }: { status: string }) {
  return (
    <StatusPill
      tone={
        status === "active" ? "ok" : status === "concluded" ? "danger" : "muted"
      }
    >
      {statusLabel(status)}
    </StatusPill>
  );
}

/**
 * One organisation, closed.
 *
 *   Musabe Schools                          ACTIVE
 *   Accountant · Member
 *   Employment                     Sep 2026 — Present
 *
 * Three short lines and nothing else: the description, the member count and
 * everything else belong to the organisation once it is opened.
 */
export function OrganisationCard({
  entry,
  href,
}: {
  entry: Participation;
  href?: string;
}) {
  const { organisation, membership } = entry;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[13.5px] font-semibold text-yz-ink">
          {organisation.name}
        </span>

        <MembershipStatusPill status={membership.status} />
      </div>

      <div className="mt-0.5 truncate text-[12px] text-yz-neutral-700">
        {describePlacement(membership)}
      </div>

      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[12px] text-yz-neutral-600">
        <span className="truncate">{membership.participationLabel}</span>

        <span className="shrink-0 tabular-nums">
          {describeTimeline(membership)}
        </span>
      </div>
    </>
  );

  if (!href) {
    return <div className="py-2.5">{body}</div>;
  }

  return (
    <Link
      href={href}
      className="-mx-2 block rounded-sm px-2 py-2.5 transition-colors duration-150 hover:bg-yz-neutral-100"
    >
      {body}
    </Link>
  );
}
