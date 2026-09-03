"use client";

import { useState } from "react";

import { PageHeader } from "@/components/ui/panel";
import { useProfile } from "../profile/profile-provider";
import { CvPanel } from "./cv-panel";
import { PortfolioPanel } from "./portfolio-panel";

const TABS = [
  { value: "cv", label: "CV" },
  { value: "portfolio", label: "Portfolio" },
] as const;

type Tab = (typeof TABS)[number]["value"];

export function CvScreen() {
  const { profile, loading } = useProfile();
  const [tab, setTab] = useState<Tab>("cv");

  if (loading) {
    return <p className="text-[13px] text-yz-neutral-600">Loading…</p>;
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="CV & Portfolio"
        description="Your verified professional record, generated from what you've actually done on Yahzel."
      />

      <div
        role="tablist"
        aria-label="CV sections"
        className="flex items-center gap-1 border-b border-yz-neutral-200"
      >
        {TABS.map((option) => {
          const active = tab === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(option.value)}
              className={`-mb-px border-b-2 px-2.5 py-2 text-[13px] font-semibold transition-colors duration-150 ${
                active
                  ? "border-yz-accent text-yz-ink"
                  : "border-transparent text-yz-neutral-600 hover:text-yz-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {tab === "cv" ? <CvPanel profileId={profile.id} /> : <PortfolioPanel profileId={profile.id} />}
    </div>
  );
}
