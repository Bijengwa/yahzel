"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  PageHeader,
  Panel,
  PanelGroup,
  StatusMessage,
} from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { formatJoinedDate } from "@/lib/format";
import {
  describeStanding,
  describeTimeline,
  fetchOrganisation,
  type Membership,
  type Organisation,
} from "@/lib/organisation";
import { ReadRow } from "../profile/profile-section";
import { MembershipStatusPill } from "./organisation-card";
import { OrganisationTabs } from "./organisation-tabs";
import { PeoplePanel } from "./people-panel";
import { StandingPills } from "./standing-pills";

/**
 * One organisation: what it is, where the reader stands in it, and who else
 * is here — its Administration first, then everybody else.
 */
export function OrganisationScreen({
  organisationId,
}: {
  organisationId: number;
}) {
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchOrganisation(organisationId);

      setOrganisation(result.organisation);
      setMembership(result.membership);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    }
  }, [organisationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="space-y-3">
        <PageHeader title="Organisation" />

        <StatusMessage tone="error">
          {error}{" "}
          <Link
            href="/organisation"
            className="font-bold underline underline-offset-4"
          >
            Back to my participation
          </Link>
        </StatusMessage>
      </div>
    );
  }

  if (!organisation || !membership) {
    return <p className="text-[13px] text-yz-neutral-600">Loading…</p>;
  }

  const concluded = membership.status === "concluded";

  return (
    <div className="space-y-3">
      <PageHeader
        title={organisation.name}
        description={[
          organisation.typeLabel,
          organisation.countryName,
          `${organisation.memberCount} ${
            organisation.memberCount === 1 ? "person" : "people"
          }`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Link
            href="/organisation"
            className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
          >
            All organisations
          </Link>
        }
      />

      <OrganisationTabs organisationId={organisation.id} />

      <Panel>
        <PanelGroup title="About">
          {organisation.description && (
            <p className="mb-2 text-[13px] leading-6 text-yz-neutral-700">
              {organisation.description}
            </p>
          )}

          <dl>
            <ReadRow label="Type" value={organisation.typeLabel} />

            <ReadRow label="Country" value={organisation.countryName} />

            <ReadRow
              label="Registered"
              value={formatJoinedDate(organisation.createdAt)}
            />
          </dl>
        </PanelGroup>

        <PanelGroup title="You, here">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-yz-ink">
                {describeStanding(membership)}
              </p>

              <p className="mt-0.5 text-[12px] leading-5 text-yz-neutral-600">
                {membership.participationLabel} · {describeTimeline(membership)}
              </p>
            </div>

            <span className="flex items-center gap-2">
              <StandingPills membership={membership} />
              <MembershipStatusPill status={membership.status} />
            </span>
          </div>

          <p className="mt-3 border-t border-yz-neutral-200 pt-3 text-[12px] leading-5 text-yz-neutral-600">
            {membership.isAdmin
              ? "Admin is a Yahzel access role: you can invite people and manage standing. It is not a position in the organisation — Administration is, and it is assigned separately."
              : "Administration is the organisation's leadership class. Admin is a separate Yahzel access role."}
          </p>
        </PanelGroup>

        {!concluded && (
          <PeoplePanel
            organisationId={organisation.id}
            canAdminister={membership.isAdmin && membership.status === "active"}
            currentMemberId={membership.id}
          />
        )}
      </Panel>
    </div>
  );
}
