"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { fetchOrganisation, updateOrganisation, type Organisation } from "@/lib/organisation";
import { useCountries } from "../profile/use-countries";
import { useOrganisationVocabulary } from "../organisation/use-organisation-types";
import {
  AdminOrganisationSelect,
  useAdminOrganisationPicker,
} from "../work/admin-organisation-picker";

type Status = { tone: "ok" | "error"; message: string } | null;

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

function toForm(organisation: Organisation) {
  return {
    name: organisation.name,
    type: organisation.type,
    country: organisation.country ?? "",
    description: organisation.description ?? "",
  };
}

export function OrganizationSettingsPanel() {
  const { organisations, organisationId, setOrganisationId } = useAdminOrganisationPicker();
  const countries = useCountries();
  const vocabulary = useOrganisationVocabulary();

  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [form, setForm] = useState<ReturnType<typeof toForm> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!organisationId) return;

    try {
      const { organisation: current } = await fetchOrganisation(organisationId);
      setOrganisation(current);
      setForm(toForm(current));
      setError(null);
    } catch (caught) {
      setError(failureMessage(caught));
    }
  }, [organisationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save() {
    if (!organisationId || !form) return;

    setSaving(true);
    setStatus(null);
    setErrors({});

    try {
      const { message, organisation: updated } = await updateOrganisation(organisationId, {
        name: form.name,
        type: form.type,
        country: form.country || null,
        description: form.description || null,
      });

      setOrganisation(updated);
      setStatus({ tone: "ok", message });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.byField());
        setStatus(caught.errors.length === 0 ? { tone: "error", message: caught.message } : null);
      } else {
        setStatus({ tone: "error", message: failureMessage(caught) });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {organisations !== null && organisations.length === 0 && (
        <StatusMessage tone="error">
          You need to administer an organisation to change its settings.
        </StatusMessage>
      )}

      {error && <StatusMessage tone="error">{error}</StatusMessage>}
      {status && <StatusMessage tone={status.tone}>{status.message}</StatusMessage>}

      {organisationId !== null && (
        <Panel>
          <PanelGroup
            title="Organisation details"
            trailing={
              <AdminOrganisationSelect
                organisations={organisations ?? []}
                organisationId={organisationId}
                onChange={setOrganisationId}
              />
            }
          >
            {!organisation || !form ? (
              <p className="text-[13px] text-yz-neutral-600">Loading…</p>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
                className="grid max-w-xl gap-3"
              >
                <TextField
                  id="orgName"
                  label="Name"
                  value={form.name}
                  error={errors.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    id="orgType"
                    label="Type"
                    value={form.type}
                    error={errors.type}
                    onChange={(event) => setForm({ ...form, type: event.target.value })}
                  >
                    {vocabulary.organisationTypes.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>

                  <SelectField
                    id="orgCountry"
                    label="Country"
                    value={form.country}
                    error={errors.country}
                    onChange={(event) => setForm({ ...form, country: event.target.value })}
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
                  id="orgDescription"
                  label="What it does"
                  hint="Optional. One or two sentences."
                  value={form.description}
                  error={errors.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />

                <div>
                  <Button type="submit" variant="primary" size="sm" disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            )}
          </PanelGroup>
        </Panel>
      )}
    </div>
  );
}
