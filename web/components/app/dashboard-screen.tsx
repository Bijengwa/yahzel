"use client";

import Link from "next/link";

import { StatusPill } from "@/components/ui/status-pill";
import { formatJoinedDate } from "@/lib/format";
import { Avatar } from "./profile/avatar";
import { CompletionChecklist, CompletionMeter } from "./profile/completion-meter";
import { useProfile } from "./profile/profile-provider";

const ENTRY_POINTS = [
  {
    href: "/profile",
    title: "Profile",
    description:
      "Your name, username, contact details and picture — the identity everything else in Yahzel grows from.",
  },
  {
    href: "/settings",
    title: "Settings",
    description: "Change your password or sign out of Yahzel.",
  },
];

export function DashboardScreen() {
  const { profile } = useProfile();

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-yz-neutral-200 bg-yz-panel">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5">
          <Avatar
            fullName={profile.fullName}
            src={profile.profilePictureUrl}
            size={64}
          />

          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.14em] text-yz-accent uppercase">
              Your Yahzel identity
            </p>

            <h1 className="font-brand mt-1 text-[22px] leading-tight font-extrabold tracking-tight text-yz-ink sm:text-[24px]">
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
        </div>

        <div className="border-t border-yz-neutral-200 px-5 py-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[11px] font-bold tracking-[0.14em] text-yz-neutral-600 uppercase">
              Profile completion
            </h2>

            <span className="font-mono text-[15px] font-medium text-yz-ink tabular-nums">
              {profile.completion.percent}%
            </span>
          </div>

          <CompletionMeter
            completion={profile.completion}
            className="mt-3"
          />

          {profile.completion.isComplete ? (
            <p className="mt-3 text-[13px] text-yz-neutral-600">
              Everything Yahzel needs is on file. You can change any of it from{" "}
              <Link
                href="/profile"
                className="font-semibold text-yz-ink underline underline-offset-4"
              >
                Profile
              </Link>
              .
            </p>
          ) : (
            <>
              <CompletionChecklist
                completion={profile.completion}
                className="mt-3"
              />

              <Link
                href="/profile"
                className="mt-4 inline-flex rounded-sm bg-yz-ink px-4 py-2 text-[13px] font-bold text-yz-ink-contrast transition-colors duration-150 hover:opacity-90"
              >
                Finish your profile
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {ENTRY_POINTS.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="group rounded-md border border-yz-neutral-200 bg-yz-panel p-4 transition-colors duration-150 hover:border-yz-neutral-400"
          >
            <h2 className="font-brand text-[15px] font-extrabold tracking-tight text-yz-ink">
              {entry.title}
            </h2>

            <p className="mt-1.5 text-[13px] leading-6 text-yz-neutral-600">
              {entry.description}
            </p>

            <span className="mt-3 inline-block text-[12px] font-bold tracking-[0.08em] text-yz-ink uppercase underline-offset-4 group-hover:underline">
              Open
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}