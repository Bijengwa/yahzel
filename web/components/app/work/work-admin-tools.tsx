"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchParticipation } from "@/lib/organisation";

/**
 * Doorway into Phase 4's admin surfaces (Capabilities, Stalled work, Work
 * settings), shown on /work for anyone who administers at least one active
 * organisation — the same visibility rule HierarchyEntry uses. Renders
 * nothing otherwise, so it adds no clutter for a regular member.
 */
export function WorkAdminTools() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchParticipation()
      .then(({ participation }) => {
        if (!cancelled) {
          setIsAdmin(
            participation.some(
              (entry) =>
                entry.membership.isAdmin && entry.membership.status === "active",
            ),
          );
        }
      })
      .catch(() => {
        // Stay hidden on failure — this is a convenience link, not a
        // permission decision (the destinations re-check independently).
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-sm border border-yz-neutral-200 bg-yz-panel px-3.5 py-2.5">
      <span className="text-[12.5px] font-semibold text-yz-neutral-700">
        Organisational work:
      </span>

      <Link
        href="/work/capabilities"
        className="text-[12.5px] font-semibold text-yz-ink underline-offset-4 hover:underline"
      >
        Capabilities
      </Link>

      <Link
        href="/work/stalled"
        className="text-[12.5px] font-semibold text-yz-ink underline-offset-4 hover:underline"
      >
        Stalled work
      </Link>

      <Link
        href="/work/settings"
        className="text-[12.5px] font-semibold text-yz-ink underline-offset-4 hover:underline"
      >
        Settings
      </Link>
    </div>
  );
}
