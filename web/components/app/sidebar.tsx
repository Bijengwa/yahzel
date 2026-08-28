"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { YahzelIcon } from "@/components/yahzel-icon";
import { CompletionSummary } from "./completion-meter";
import { FUTURE_AREAS, NAV_ITEMS } from "./nav";
import { useProfile } from "./profile-provider";
import { Avatar } from "./avatar";

export function Sidebar({
  onNavigate,
  onRequestLogout,
}: {
  onNavigate?: () => void;
  onRequestLogout: () => void;
}) {
  const pathname = usePathname();
  const { profile } = useProfile();

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center gap-2.5 border-b border-yz-neutral-200 px-5">
        <YahzelIcon size={26} className="text-yz-ink" title={null} />

        <span className="font-brand text-[17px] leading-none font-extrabold tracking-tight text-yz-ink">
          Yahzel
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Main">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 border-l-[3px] px-3.5 py-2.5 text-[14px] font-semibold transition-colors duration-150 ${
                    active
                      ? "border-yz-accent bg-yz-neutral-100 text-yz-ink"
                      : "border-transparent text-yz-neutral-700 hover:bg-yz-neutral-100 hover:text-yz-ink"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 px-3.5 text-[11px] font-bold tracking-[0.12em] text-yz-neutral-500 uppercase">
          Coming to Yahzel
        </p>

        <ul className="mt-2 space-y-0.5">
          {FUTURE_AREAS.map((area) => (
            <li
              key={area}
              className="flex cursor-default items-center justify-between border-l-[3px] border-transparent px-3.5 py-2 text-[14px] text-yz-neutral-400"
            >
              {area}
              <span className="text-[10px] font-bold tracking-[0.1em] uppercase">
                Soon
              </span>
            </li>
          ))}
        </ul>
      </nav>

      {profile && (
        <div className="border-t border-yz-neutral-200 px-5 py-4">
          <CompletionSummary completion={profile.completion} />

          <div className="mt-5 flex items-center gap-3">
            <Avatar
              fullName={profile.fullName}
              src={profile.profilePictureUrl}
              size={36}
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-yz-ink">
                {profile.fullName}
              </p>
              <p className="truncate font-mono text-[12px] text-yz-neutral-600">
                @{profile.username}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onRequestLogout}
            className="mt-4 w-full border border-yz-neutral-300 px-3 py-2 text-[12px] font-bold text-yz-neutral-700 transition-colors duration-150 hover:border-yz-ink hover:text-yz-ink"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
