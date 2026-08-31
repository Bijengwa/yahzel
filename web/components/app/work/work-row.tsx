import Link from "next/link";

import { formatRelativeDay, formatShortDate } from "@/lib/format";
import type { WorkItemSummary } from "@/lib/work";
import { WorkProgress } from "./work-progress";
import { WorkStatusPill } from "./work-status-pill";

const GRID =
  "grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]";

export function WorkRowHeader() {
  return (
    <div
      className={`hidden border-b border-yz-neutral-200 pb-2 text-[11px] font-bold tracking-[0.04em] text-yz-neutral-600 uppercase sm:grid sm:items-center sm:gap-3 ${GRID}`}
    >
      <span>Work</span>
      <span>Status</span>
      <span>Assignee</span>
      <span>Due</span>
      <span>Progress</span>
      <span>Updated</span>
    </div>
  );
}

export function WorkRow({
  item,
  ownerName,
}: {
  item: WorkItemSummary;
  /**
   * Resolved client-side from the organisation's member list — the Work API
   * only returns ids (see the plan's Global Constraints note), and this
   * screen already has the list for the assignee picker.
   */
  ownerName: string | null;
}) {
  const overdue =
    item.dueAt !== null &&
    item.status !== "done" &&
    // eslint-disable-next-line react-hooks/purity
    new Date(item.dueAt).getTime() < Date.now();

  const owner = item.activeAssignment ? (ownerName ?? "Unknown") : "Unassigned";

  return (
    <Link
      href={`/work/${item.id}`}
      className="-mx-2 block rounded-sm px-2 py-2 transition-colors duration-150 hover:bg-yz-neutral-100"
    >
      {/* Desktop: one aligned row */}
      <div className={`hidden items-center gap-3 sm:grid ${GRID}`}>
        <span className="min-w-0 truncate text-[13.5px] font-semibold text-yz-ink">
          {item.title}
        </span>

        <span>
          <WorkStatusPill status={item.status} />
        </span>

        <span className="min-w-0 truncate text-[12.5px] text-yz-neutral-700">
          {owner}
        </span>

        <span
          className={`text-[12.5px] tabular-nums ${
            overdue ? "text-yz-danger-ink" : "text-yz-neutral-700"
          }`}
        >
          {formatShortDate(item.dueAt) ?? "—"}
        </span>

        <span>
          <WorkProgress value={item.progress} />
        </span>

        <span className="text-[12.5px] tabular-nums text-yz-neutral-600">
          {formatRelativeDay(item.updatedAt)}
        </span>
      </div>

      {/* Mobile/tablet: stacked two-line summary */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[13.5px] font-semibold text-yz-ink">
            {item.title}
          </span>

          <WorkStatusPill status={item.status} />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-yz-neutral-600">
          <span className="truncate">{owner}</span>

          <WorkProgress value={item.progress} />

          <span className={overdue ? "text-yz-danger-ink" : undefined}>
            Due {formatShortDate(item.dueAt) ?? "—"}
          </span>

          <span>Updated {formatRelativeDay(item.updatedAt)}</span>
        </div>
      </div>
    </Link>
  );
}
