"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import {
  fetchCv,
  fetchPortfolio,
  fetchPortfolioSettings,
  updatePortfolioSettings,
  type Portfolio,
  type PortfolioVisibility,
  type VerifiedWork,
} from "@/lib/cv";
import { formatMonthYear } from "@/lib/format";

type Status = { tone: "ok" | "error"; message: string } | null;

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

const VISIBILITY_OPTIONS: { value: PortfolioVisibility; label: string; hint: string }[] = [
  { value: "private", label: "Private", hint: "Only you can see your CV and portfolio." },
  {
    value: "organisation",
    label: "Organisation",
    hint: "Anyone in an organisation you currently belong to can see it.",
  },
  { value: "public", label: "Public", hint: "Any signed-in Yahzel user can see it." },
];

function PortfolioPreview({ portfolio }: { portfolio: Portfolio }) {
  return (
    <Panel>
      <PanelGroup title="Portfolio preview" trailing={<StatusPill tone="muted">{portfolio.visibility}</StatusPill>}>
        <p className="text-[15px] font-bold text-yz-ink">{portfolio.profile.fullName}</p>
        {portfolio.profile.headline && (
          <p className="text-[13px] text-yz-neutral-700">{portfolio.profile.headline}</p>
        )}

        {portfolio.skills.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {portfolio.skills.map((skill) => (
              <span
                key={skill.id}
                className="rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-yz-ink"
              >
                {skill.name}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-sm border border-yz-neutral-200 px-3 py-2.5">
            <div className="text-[19px] font-extrabold tabular-nums text-yz-ink">
              {portfolio.stats.organisationsCount}
            </div>
            <div className="text-[11px] font-semibold text-yz-neutral-600">Organisations</div>
          </div>
          <div className="rounded-sm border border-yz-neutral-200 px-3 py-2.5">
            <div className="text-[19px] font-extrabold tabular-nums text-yz-ink">
              {portfolio.stats.verifiedWorkCount}
            </div>
            <div className="text-[11px] font-semibold text-yz-neutral-600">Verified work</div>
          </div>
        </div>

        {portfolio.featuredWork.length > 0 && (
          <div className="mt-3">
            <h3 className="text-[12px] font-bold text-yz-neutral-600">Featured work</h3>
            <ul className="mt-1.5 space-y-2">
              {portfolio.featuredWork.map((work) => (
                <li key={work.reportId} className="border-b border-yz-neutral-200 pb-2 last:border-b-0">
                  <p className="text-[13px] font-semibold text-yz-ink">{work.title}</p>
                  <p className="text-[12px] text-yz-neutral-500">
                    {work.organisationName} · {formatMonthYear(work.reviewedAt) ?? "?"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PanelGroup>
    </Panel>
  );
}

export function PortfolioPanel({ profileId }: { profileId: number }) {
  const [visibility, setVisibility] = useState<PortfolioVisibility>("private");
  const [featuredIds, setFeaturedIds] = useState<number[]>([]);
  const [verifiedWork, setVerifiedWork] = useState<VerifiedWork[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const load = useCallback(async () => {
    try {
      const [{ settings }, { cv }, { portfolio: preview }] = await Promise.all([
        fetchPortfolioSettings(profileId),
        fetchCv(profileId),
        fetchPortfolio(profileId),
      ]);

      setVisibility(settings.visibility);
      setFeaturedIds(settings.featuredWorkItemIds);
      setVerifiedWork(cv.verifiedWork);
      setPortfolio(preview);
      setError(null);
    } catch (caught) {
      setError(failureMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const toggleFeatured = (workItemId: number) => {
    setFeaturedIds((current) =>
      current.includes(workItemId)
        ? current.filter((id) => id !== workItemId)
        : [...current, workItemId],
    );
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);

    try {
      const { settings } = await updatePortfolioSettings(profileId, {
        visibility,
        featuredWorkItemIds: featuredIds,
      });
      setVisibility(settings.visibility);
      setFeaturedIds(settings.featuredWorkItemIds);
      setStatus({ tone: "ok", message: "Portfolio settings saved." });
      const { portfolio: preview } = await fetchPortfolio(profileId);
      setPortfolio(preview);
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-[13px] text-yz-neutral-600">Loading your portfolio…</p>;
  }

  if (error) {
    return <StatusMessage tone="error">{error}</StatusMessage>;
  }

  return (
    <div className="space-y-3">
      <Panel>
        <PanelGroup title="Visibility">
          {status && <StatusMessage tone={status.tone} className="mb-3">{status.message}</StatusMessage>}

          <div className="max-w-xs">
            <SelectField
              id="portfolioVisibility"
              label="Who can see your CV and portfolio"
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as PortfolioVisibility)}
            >
              {VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            <p className="mt-1.5 text-[12px] text-yz-neutral-600">
              {VISIBILITY_OPTIONS.find((o) => o.value === visibility)?.hint}
            </p>
          </div>
        </PanelGroup>

        <PanelGroup title="Featured work">
          {verifiedWork.length === 0 ? (
            <p className="text-[13px] text-yz-neutral-500">
              Nothing to feature yet — only your own verified work (an accepted report) can be
              featured.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {verifiedWork.map((work) => (
                <li key={work.workItemId} className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id={`feature-${work.workItemId}`}
                    checked={featuredIds.includes(work.workItemId)}
                    onChange={() => toggleFeatured(work.workItemId)}
                    className="h-4 w-4 rounded-sm border-yz-neutral-300"
                  />
                  <label htmlFor={`feature-${work.workItemId}`} className="text-[13px] text-yz-ink">
                    {work.title}
                    <span className="ml-1.5 text-[12px] text-yz-neutral-500">
                      ({work.organisationName})
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex justify-end">
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save portfolio settings"}
            </Button>
          </div>
        </PanelGroup>
      </Panel>

      {portfolio && <PortfolioPreview portfolio={portfolio} />}
    </div>
  );
}
