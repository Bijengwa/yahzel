"use client";

import type { Profile } from "@/lib/profile";
import { EmailPanel } from "./email-panel";
import { PhonePanel } from "./phone-panel";
import { ProfileSection } from "./profile-section";

/**
 * Both contact details carry a verification state, so neither is a plain
 * save-and-done field. Each one runs its own flow inside the section rather
 * than sharing a single Edit button that could not describe both.
 */
export function ContactInformation({ profile }: { profile: Profile }) {
  return (
    <ProfileSection
      id="contact-information"
      title="Contact information"
      description="How Yahzel reaches you. Changes here need to be verified before they take effect."
      editing={false}
    >
      <div>
        <EmailPanel profile={profile} />
        <PhonePanel profile={profile} />
      </div>
    </ProfileSection>
  );
}
