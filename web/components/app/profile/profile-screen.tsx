"use client";

import { formatJoinedDate } from "@/lib/format";
import { CompletionChecklist, CompletionMeter } from "./completion-meter";
import { ContactInformation } from "./contact-information";
import { PersonalInformation } from "./personal-information";
import { ProfilePicture } from "./profile-picture";
import { useProfile } from "./profile-provider";

export function ProfileScreen() {
  const { profile } = useProfile();

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-brand text-[19px] font-extrabold tracking-tight text-yz-ink">
            Personal profile
          </h1>

          <p className="mt-0.5 text-[12.5px] text-yz-neutral-600">
            Member since {formatJoinedDate(profile.createdAt)}
          </p>
        </div>

        {!profile.completion.isComplete && (
          <div className="flex items-center gap-2">
            <CompletionMeter
              completion={profile.completion}
              className="w-24"
            />

            <span className="font-mono text-[12px] text-yz-neutral-600 tabular-nums">
              {profile.completion.percent}%
            </span>
          </div>
        )}
      </div>

      {!profile.completion.isComplete && (
        <div className="rounded-md border border-yz-neutral-200 bg-yz-neutral-100 px-4 py-3">
          <CompletionChecklist completion={profile.completion} />
        </div>
      )}

      <div className="rounded-md border border-yz-neutral-200 bg-yz-panel px-5">
        <div className="border-b border-yz-neutral-200 py-4">
          <ProfilePicture profile={profile} />
        </div>

        <PersonalInformation profile={profile} />

        <ContactInformation profile={profile} />
      </div>
    </div>
  );
}
