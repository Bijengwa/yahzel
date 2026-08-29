"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { PageHeader, Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { registerOrganisation } from "@/lib/organisation";
import { useCountries } from "../profile/use-countries";
import { useOrganisationVocabulary } from "./use-organisation-types";

const EMPTY = {
  name: "",
  type: "",
  country: "",
  description: "",
};

/**
 * Registering an organisation. Deliberately short: a name, what kind of
 * organisation it is, where it is, and what it does. Registering makes the
 * registrant an Admin — a Yahzel access role — and nothing more.
 */
export function RegisterOrganisationScreen() {
  const router = useRouter();
  const countries = useCountries();
  const vocabulary = useOrganisationVocabulary();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(key: keyof typeof EMPTY, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setMessage(null);
  }

  async function submit() {
    setSaving(true);
    setErrors({});
    setMessage(null);

    try {
      const { organisation } = await registerOrganisation({
        name: form.name,
        type: form.type,
        country: form.country || null,
        description: form.description || null,
      });

      router.push(`/organisation/${organisation.id}`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.byField());
        setMessage(caught.errors.length === 0 ? caught.message : null);
      } else {
        setMessage("Something went wrong. Please try again.");
      }

      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Register an organisation"
        description="A company, NGO, government institution, agency — anything people work inside."
        actions={
          <Link
            href="/organisation"
            className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
          >
            Back
          </Link>
        }
      />

      {message && <StatusMessage tone="error">{message}</StatusMessage>}

      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <PanelGroup title="Register organisation">
            <div className="grid max-w-xl gap-3">
              <TextField
                id="name"
                label="Name"
                autoComplete="organization"
                value={form.name}
                error={errors.name}
                onChange={(event) => update("name", event.target.value)}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  id="type"
                  label="Type"
                  value={form.type}
                  error={errors.type}
                  onChange={(event) => update("type", event.target.value)}
                >
                  <option value="">Choose a type</option>

                  {vocabulary.organisationTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectField>

                <SelectField
                  id="country"
                  label="Country"
                  value={form.country}
                  error={errors.country}
                  onChange={(event) => update("country", event.target.value)}
                >
                  <option value="">Not set</option>

                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </SelectField>
              </div>

              <TextAreaField
                id="description"
                label="What it does"
                hint="Optional. One or two sentences."
                value={form.description}
                error={errors.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </div>
          </PanelGroup>

          <div className="flex items-center gap-2 py-4">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Registering…" : "Register organisation"}
            </Button>

            <Link
              href="/organisation"
              className="px-3 py-1.5 text-[12px] font-bold text-yz-neutral-700 hover:text-yz-ink"
            >
              Cancel
            </Link>
          </div>
        </form>
      </Panel>
    </div>
  );
}
