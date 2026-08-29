import type { Metadata } from "next";
import Link from "next/link";

import { YahzelIcon } from "@/components/yahzel-icon";

export const metadata: Metadata = {
  title: "Terms & Conditions",
};

/**
 * The destination the registration checkbox points at.
 *
 * Deliberately a plain summary rather than a legal instrument: Yahzel has no
 * legal content structure yet, and inventing binding wording here would be
 * worse than saying plainly what the product does with what it is given.
 * Replace this body when the real terms exist.
 */
const SECTIONS = [
  {
    title: "Your account",
    body: "You are responsible for what happens under your account, and for keeping your password to yourself. Yahzel assigns your username; you can change it later from your profile.",
  },
  {
    title: "Your information",
    body: "Yahzel stores the details you enter — your name, email address, phone number and profile picture — so it can show your professional identity to the organisations you take part in.",
  },
  {
    title: "Organisations",
    body: "Joining an organisation is always your decision. An invitation waits for you until you accept or decline it, and being invited never adds you to an organisation on its own. When you take part in an organisation, the people in it can see your name, your title there, and how you take part.",
  },
  {
    title: "Your record",
    body: "Yahzel keeps the history of the organisations you have taken part in, including relationships that have concluded. That record is what makes your professional history meaningful, so it is not deleted when a relationship ends.",
  },
  {
    title: "Acceptable use",
    body: "Do not use Yahzel to impersonate somebody else, to misrepresent an organisation, or to do anything unlawful.",
  },
  {
    title: "Changes",
    body: "These terms may change as Yahzel grows. Material changes will be made clear before they take effect.",
  },
];

export default function TermsPage() {
  return (
    <main className="flex min-h-screen flex-col bg-yz-bg px-5 py-5 text-yz-ink">
      <div className="flex items-center justify-between">
        <Link href="/auth/register" className="flex items-center gap-2">
          <YahzelIcon
            size={22}
            className="text-yz-ink"
            title={null}
            maskId="yz-legal-mark"
          />

          <span className="font-brand text-[15px] font-extrabold tracking-tight text-yz-ink">
            Yahzel
          </span>
        </Link>

        <Link
          href="/auth/register"
          className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
        >
          Back to registration
        </Link>
      </div>

      <div className="mx-auto w-full max-w-2xl py-10">
        <h1 className="font-brand text-[24px] leading-tight font-extrabold tracking-tight text-yz-ink">
          Terms &amp; Conditions
        </h1>

        <p className="mt-1.5 text-[13px] leading-6 text-yz-neutral-600">
          A plain summary of what using Yahzel means.
        </p>

        <div className="mt-6 divide-y divide-yz-neutral-200 border-y border-yz-neutral-200">
          {SECTIONS.map((section) => (
            <section key={section.title} className="py-4">
              <h2 className="text-[13px] font-bold text-yz-ink">
                {section.title}
              </h2>

              <p className="mt-1 text-[13px] leading-6 text-yz-neutral-700">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
