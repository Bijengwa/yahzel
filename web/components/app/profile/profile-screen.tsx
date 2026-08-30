"use client";

import { useState } from "react";

import { formatJoinedDate } from "@/lib/format";
import { CompletionChecklist, CompletionMeter } from "./completion-meter";
import { ContactInformation } from "./contact-information";
import { OrganisationsPanel } from "./organisations-panel";
import { PersonalInformation } from "./personal-information";
import { ProfilePicture } from "./profile-picture";
import { useProfile } from "./profile-provider";

const TABS = [
  { value: "about", label: "About me" },
  { value: "organisations", label: "Organisations" },
] as const;

type Tab = (typeof TABS)[number]["value"];

export function ProfileScreen() {
  const { profile } = useProfile();

  const [tab, setTab] = useState<Tab>("about");

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-brand text-[22px] leading-none font-extrabold tracking-tight text-yz-ink">
            Personal profile
          </h1>

          <p className="mt-1.5 text-[13px] text-yz-neutral-600">
            Member since {formatJoinedDate(profile.createdAt)}
          </p>
        </div>

        {!profile.completion.isComplete && (
          <div className="flex items-center gap-2">
            <CompletionMeter completion={profile.completion} className="w-24" />

            <span className="font-mono text-[12px] text-yz-neutral-600 tabular-nums">
              {profile.completion.percent}%
            </span>
          </div>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Profile sections"
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
              className={`-mb-px border-b-2 px-1 py-2.5 text-[13px] font-semibold transition-colors duration-150 ${
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

      {tab === "about" ? (
        <>
          {!profile.completion.isComplete && (
            <div className="rounded-[12px] border border-yz-neutral-200 bg-yz-neutral-100 px-4 py-3">
              <CompletionChecklist completion={profile.completion} />
            </div>
          )}

          <div className="rounded-[12px] border border-yz-neutral-200 bg-yz-panel px-4 shadow-[var(--yz-shadow)] sm:px-5">
            <div className="border-b border-yz-neutral-200 py-4">
              <ProfilePicture profile={profile} />
            </div>

            <PersonalInformation profile={profile} />

            <ContactInformation profile={profile} />
          </div>
        </>
      ) : (
        <OrganisationsPanel />
      )}
    </div>
  );
}
