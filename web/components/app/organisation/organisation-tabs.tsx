"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "", label: "About" },
  { slug: "overview", label: "Overview" },
  { slug: "attention", label: "Attention" },
  { slug: "hierarchy", label: "Structure" },
  { slug: "activity", label: "Activity" },
  { slug: "search", label: "Search" },
] as const;

/**
 * The Organisation area's sub-navigation. One organisation, several lenses on
 * it — About (who it is), Overview (current operational counts), Attention
 * (what needs a look), Structure (positions/departments — the existing
 * hierarchy screen), Activity (what happened), Search (find a record fast).
 */
export function OrganisationTabs({ organisationId }: { organisationId: number }) {
  const pathname = usePathname();
  const base = `/organisation/${organisationId}`;

  return (
    <nav className="flex flex-wrap gap-1 border-b border-yz-neutral-200">
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = pathname === href;

        return (
          <Link
            key={tab.label}
            href={href}
            className={`rounded-t-sm px-3 py-2 text-[12.5px] font-bold transition-colors ${
              active
                ? "border-b-2 border-yz-ink text-yz-ink"
                : "border-b-2 border-transparent text-yz-neutral-600 hover:text-yz-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
