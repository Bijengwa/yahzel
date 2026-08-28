"use client";

import { StatusPill } from "@/components/ui/status-pill";
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
    <div className="space-y-6">
      <header className="border border-yz-neutral-300 bg-yz-panel p-6 sm:p-8">
        <p className="text-[11px] font-bold tracking-[0.14em] text-yz-accent uppercase">
          Personal profile
        </p>

        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <ProfilePicture profile={profile} />

            <h1 className="font-brand mt-5 text-[26px] leading-tight font-extrabold tracking-tight text-yz-ink sm:text-[30px]">
              {profile.fullName}
            </h1>

            <p className="mt-1 font-mono text-[13px] text-yz-neutral-600">
              @{profile.username}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[13px] break-all text-yz-neutral-700">
                {profile.email}
              </span>

              {profile.emailVerified ? (
                <StatusPill tone="ok">Verified</StatusPill>
              ) : (
                <StatusPill tone="warn">Not verified</StatusPill>
              )}
            </div>

            <p className="mt-3 text-[12px] text-yz-neutral-500">
              With Yahzel since {formatJoinedDate(profile.createdAt)}
            </p>
          </div>

          <div className="w-full border border-yz-neutral-300 bg-yz-neutral-100 p-5 lg:w-[280px] lg:shrink-0">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[11px] font-bold tracking-[0.12em] text-yz-neutral-600 uppercase">
                Profile complete
              </h2>

              <span className="font-mono text-[15px] font-medium text-yz-ink tabular-nums">
                {profile.completion.percent}%
              </span>
            </div>

            <CompletionMeter completion={profile.completion} className="mt-3" />

            {profile.completion.isComplete ? (
              <p className="mt-3 text-[13px] leading-6 text-yz-neutral-600">
                Everything Yahzel needs is on file.
              </p>
            ) : (
              <CompletionChecklist completion={profile.completion} />
            )}
          </div>
        </div>
      </header>

      <PersonalInformation profile={profile} />

      <ContactInformation profile={profile} />
    </div>
  );
}
