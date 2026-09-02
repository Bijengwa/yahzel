import Link from "next/link";

import { formatShortDate } from "@/lib/format";
import type { Project } from "@/lib/projects";
import { ProjectStatusPill } from "./project-status-pill";

const GRID =
  "grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]";

export function ProjectRowHeader() {
  return (
    <div
      className={`hidden border-b border-yz-neutral-200 pb-2 text-[11px] font-bold tracking-[0.04em] text-yz-neutral-600 uppercase sm:grid sm:items-center sm:gap-3 ${GRID}`}
    >
      <span>Project</span>
      <span>Status</span>
      <span>Owner</span>
      <span>Target date</span>
    </div>
  );
}

export function ProjectRow({
  project,
  ownerName,
}: {
  project: Project;
  /** Resolved client-side, the same way WorkRow resolves an assignee name. */
  ownerName: string | null;
}) {
  return (
    <Link
      href={`/projects/${project.id}?organisationId=${project.organisationId}`}
      className="-mx-2 block rounded-sm px-2 py-2 transition-colors duration-150 hover:bg-yz-neutral-100"
    >
      {/* Desktop: one aligned row */}
      <div className={`hidden items-center gap-3 sm:grid ${GRID}`}>
        <span className="min-w-0 truncate text-[13.5px] font-semibold text-yz-ink">
          {project.name}
        </span>

        <span>
          <ProjectStatusPill status={project.status} />
        </span>

        <span className="min-w-0 truncate text-[12.5px] text-yz-neutral-700">
          {ownerName ?? "Unknown"}
        </span>

        <span className="text-[12.5px] tabular-nums text-yz-neutral-700">
          {formatShortDate(project.targetEndDate) ?? "—"}
        </span>
      </div>

      {/* Mobile/tablet: stacked two-line summary */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[13.5px] font-semibold text-yz-ink">
            {project.name}
          </span>

          <ProjectStatusPill status={project.status} />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-yz-neutral-600">
          <span className="truncate">{ownerName ?? "Unknown"}</span>
          <span>Target {formatShortDate(project.targetEndDate) ?? "—"}</span>
        </div>
      </div>
    </Link>
  );
}
