"use client";

import { useState } from "react";

import { SelectField, TextField } from "@/components/ui/field";
import { ApiError } from "@/lib/api";
import { GENDER_OPTIONS, genderLabel } from "@/lib/format";
import { saveProfile, type Profile } from "@/lib/profile";
import { ProfileSection, ReadRow } from "./profile-section";
import { useCountries } from "./use-countries";
import { useProfile } from "./profile-provider";

type Draft = {
  fullName: string;
  username: string;
  gender: string;
  country: string;
};

function draftFrom(profile: Profile): Draft {
  return {
    fullName: profile.fullName,
    username: profile.username,
    gender: profile.gender ?? "",
    country: profile.country ?? "",
  };
}

export function PersonalInformation({ profile }: { profile: Profile }) {
  const { applyProfile } = useProfile();
  const countries = useCountries();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<
    { tone: "ok" | "error"; message: string } | null
  >(null);
  const [saving, setSaving] = useState(false);

  const original = draftFrom(profile);

  const dirty = (Object.keys(original) as Array<keyof Draft>).some(
    (key) => original[key] !== draft[key],
  );

  function startEditing() {
    setDraft(draftFrom(profile));
    setErrors({});
    setStatus(null);
    setEditing(true);
  }

  function cancel() {
    setDraft(draftFrom(profile));
    setErrors({});
    setStatus(null);
    setEditing(false);
  }

  function update(key: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  async function save() {
    setSaving(true);
    setErrors({});
    setStatus(null);

    try {
      const { profile: next } = await saveProfile({
        fullName: draft.fullName,
        username: draft.username,
        gender: draft.gender || null,
        country: draft.country || null,
      });

      applyProfile(next);
      setEditing(false);
      setStatus({ tone: "ok", message: "Personal information saved." });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.byField());
        setStatus({
          tone: "error",
          message: caught.errors.length
            ? "Check the highlighted fields and try again."
            : caught.message,
        });
      } else {
        setStatus({
          tone: "error",
          message: "Something went wrong. Please try again.",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProfileSection
      id="personal-information"
      title="Personal information"
      description="How Yahzel knows you and refers to you."
      editing={editing}
      saving={saving}
      dirty={dirty}
      status={status}
      onEdit={startEditing}
      onCancel={cancel}
      onSave={() => void save()}
    >
      {editing ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="fullName"
            label="Full name"
            value={draft.fullName}
            autoComplete="name"
            error={errors.fullName}
            onChange={(event) => update("fullName", event.target.value)}
          />

          <TextField
            id="username"
            label="Username"
            value={draft.username}
            autoComplete="username"
            spellCheck={false}
            error={errors.username}
            hint="Lowercase letters, numbers and underscores. This is how others will find you."
            onChange={(event) =>
              update("username", event.target.value.toLowerCase())
            }
          />

          <SelectField
            id="gender"
            label="Gender"
            value={draft.gender}
            error={errors.gender}
            onChange={(event) => update("gender", event.target.value)}
          >
            <option value="">Select an option</option>
            {GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <SelectField
            id="country"
            label="Country"
            value={draft.country}
            error={errors.country}
            hint="Sets the country code Yahzel offers for your phone number."
            onChange={(event) => update("country", event.target.value)}
          >
            <option value="">Select a country</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name} ({country.dialCode})
              </option>
            ))}
          </SelectField>
        </div>
      ) : (
        <dl>
          <ReadRow label="Full name" value={profile.fullName} />
          <ReadRow label="Username" value={`@${profile.username}`} />
          <ReadRow label="Gender" value={genderLabel(profile.gender)} />
          <ReadRow
            label="Country"
            value={
              profile.countryName
                ? `${profile.countryName} (${profile.dialCode})`
                : null
            }
          />
        </dl>
      )}
    </ProfileSection>
  );
}
