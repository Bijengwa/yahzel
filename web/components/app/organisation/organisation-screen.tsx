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
  fetchOrganisation,
  type Membership,
  type Organisation,
} from "@/lib/organisation";
import { ReadRow } from "../profile/profile-section";
import { PeoplePanel } from "./people-panel";
import { StandingPills } from "./standing-pills";

/**
 * One organisation, and its administration.
 *
 * Version 1 shows what the organisation is, where the reader stands in it,
 * and who else is here. The Administration area that follows — directors,
 * managers, HR, finance — grows out of the People group below rather than
 * replacing this screen.
 */
export function OrganisationScreen({ organisationId }: { organisationId: number }) {
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
    return (
      <p className="text-[13px] text-yz-neutral-600">Loading…</p>
    );
  }

  const invited = membership.status === "invited";

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

      {invited && (
        <StatusMessage tone="ok">
          You have been invited to this organisation. Accept or decline it from{" "}
          <Link
            href="/organisation"
            className="font-bold underline underline-offset-4"
          >
            my participation
          </Link>
          .
        </StatusMessage>
      )}

      <Panel>
        <PanelGroup title="Overview">
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

        <PanelGroup title="Administration">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-yz-ink">
                {describeStanding(membership)}
              </p>

              <p className="mt-0.5 text-[12px] leading-5 text-yz-neutral-600">
                {membership.isAdmin
                  ? "Admin is a Yahzel access role: you can invite people and remove them."
                  : "You take part in this organisation. An admin manages who belongs to it."}
              </p>
            </div>

            <StandingPills membership={membership} />
          </div>

          <p className="mt-3 border-t border-yz-neutral-200 pt-3 text-[12px] leading-5 text-yz-neutral-600">
            Head is the organisation&rsquo;s highest-ranking position. The title
            that position carries — CEO, Founder, President, Director General —
            belongs to the organisation, not to Yahzel.
          </p>
        </PanelGroup>

        {!invited && (
          <PeoplePanel
            organisationId={organisation.id}
            canAdminister={membership.isAdmin}
            currentMemberId={membership.id}
          />
        )}
      </Panel>
    </div>
  );
}
