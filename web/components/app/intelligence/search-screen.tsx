"use client";

import Link from "next/link";
import { useState } from "react";

import { TextField } from "@/components/ui/field";
import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { searchOrganisation, type SearchResultItem, type SearchResults } from "@/lib/intelligence";
import { OrganisationTabs } from "../organisation/organisation-tabs";

const CATEGORY_LABELS: Record<keyof SearchResults["results"], string> = {
  people: "People",
  positions: "Positions",
  departments: "Departments",
  work: "Work",
  projects: "Projects",
  outcomes: "Outcomes",
};

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.";
}

function ResultRow({ item }: { item: SearchResultItem }) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <Link href={item.url} className="flex items-center justify-between gap-3 hover:text-yz-ink">
        <span className="min-w-0 truncate text-[13px] font-semibold text-yz-ink">{item.title}</span>
        <span className="shrink-0 text-[11.5px] text-yz-neutral-500">{item.subtitle}</span>
      </Link>
    </li>
  );
}

/** Fast navigation to the relevant person, position, department, Work item, Project or Outcome — never a full-text engine. */
export function SearchScreen({ organisationId }: { organisationId: number }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [searching, setSearching] = useState(false);

  async function runSearch(q: string) {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }

    setSearching(true);

    try {
      const result = await searchOrganisation(organisationId, q);
      setResults(result);
      setError(null);
      setForbidden(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setForbidden(true);
      } else {
        setError(failureMessage(caught));
      }
    } finally {
      setSearching(false);
    }
  }

  if (forbidden) {
    return (
      <div className="space-y-3">
        <PageHeader title="Search" />
        <OrganisationTabs organisationId={organisationId} />
        <StatusMessage tone="error">Only an administrator can search this organisation.</StatusMessage>
      </div>
    );
  }

  const categories = results
    ? (Object.entries(results.results) as [keyof SearchResults["results"], SearchResultItem[]][])
    : [];
  const totalResults = categories.reduce((sum, [, items]) => sum + items.length, 0);

  return (
    <div className="space-y-3">
      <PageHeader title="Search" description="Find a person, position, department, Work item, Project or Outcome." />
      <OrganisationTabs organisationId={organisationId} />

      {error && <StatusMessage tone="error">{error}</StatusMessage>}

      <Panel>
        <PanelGroup title="Search">
          <TextField
            id="organisationSearch"
            label="Query"
            placeholder="Start typing…"
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              void runSearch(next);
            }}
          />

          {searching && <p className="mt-2 text-[12.5px] text-yz-neutral-600">Searching…</p>}

          {results && query.trim().length >= 2 && totalResults === 0 && !searching && (
            <p className="mt-2 text-[12.5px] text-yz-neutral-600">No matches.</p>
          )}
        </PanelGroup>

        {categories
          .filter(([, items]) => items.length > 0)
          .map(([category, items]) => (
            <PanelGroup key={category} title={`${CATEGORY_LABELS[category]} (${items.length})`}>
              <ul className="divide-y divide-yz-neutral-200">
                {items.map((item) => (
                  <ResultRow key={`${item.type}-${item.id}`} item={item} />
                ))}
              </ul>
            </PanelGroup>
          ))}
      </Panel>
    </div>
  );
}
