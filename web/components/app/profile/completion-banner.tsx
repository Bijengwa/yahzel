"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useProfile } from "./profile-provider";

/** Which part of Profile each outstanding requirement lives in. */
const SECTION_FOR_FIELD: Record<string, string> = {
  fullName: "personal-information",
  username: "personal-information",
  gender: "personal-information",
  country: "personal-information",
  email: "contact-information",
  phoneNumber: "contact-information",
};

function listMissing(labels: string[]): string {
  if (labels.length === 1) {
    return labels[0] as string;
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The nudge to finish setting up. It is driven entirely by the completion the
 * API returns, it names what is outstanding, and it goes away for good the
 * moment the last requirement is met. Profile does not show it — the person
 * is already in the right place.
 */
export function CompletionBanner() {
  const { profile } = useProfile();
  const pathname = usePathname();

  if (!profile || profile.completion.isComplete) {
    return null;
  }

  if (pathname?.startsWith("/profile")) {
    return null;
  }

  const missingLabels = profile.completion.items
    .filter((item) => !item.complete)
    .map((item) => item.label.toLowerCase());

  const firstMissing = profile.completion.missing[0] ?? "";
  const section = SECTION_FOR_FIELD[firstMissing] ?? "personal-information";

  return (
    <Link
      href={`/profile#${section}`}
      className="group block border border-yz-warn-line bg-yz-warn-bg px-4 py-3.5 transition-colors duration-150 hover:border-yz-warn-ink sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-yz-warn-ink">
            Complete your profile to get the most out of Yahzel.
          </p>

          <p className="mt-1 text-[13px] leading-5 text-yz-warn-ink/85">
            Still needed: {listMissing(missingLabels)}.
          </p>
        </div>

        <span className="text-[12px] font-bold tracking-[0.08em] text-yz-warn-ink uppercase underline-offset-4 group-hover:underline">
          Finish setup
        </span>
      </div>
    </Link>
  );
}
