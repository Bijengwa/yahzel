"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  PageHeader,
  Panel,
  PanelGroup,
  StatusMessage,
} from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import {
  assignOccupant,
  buildPositionTree,
  collectSubtreeIds,
  createPosition,
  deletePosition,
  endOccupancy,
  fetchHierarchy,
  fetchOrganisationOccupancy,
  fetchPositionOccupancyHistory,
  replaceOccupant,
  updatePosition,
  type Occupancy,
  type Position,
} from "@/lib/hierarchy";
import {
  fetchOrganisation,
  fetchOrganisationPeople,
  type Member,
  type Organisation,
} from "@/lib/organisation";
import { OrgChart } from "./org-chart";
import type { OccupancyDisplay } from "./org-chart-node";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

const EMPTY_FORM = { name: "", parentPositionId: "" };

/**
 * The organisation-scoped hierarchy workspace: a tree of positions and their
 * reporting relationships. This is admin tooling only — the backend refuses
 * anyone else, and this screen simply shows that refusal in place rather
 * than pretending the page does not exist.
 *
 * There are no people here. A position has a name and a parent, nothing
 * else — see lib/hierarchy.ts's Position type.
 */
export function HierarchyScreen({
  organisationId,
}: {
  organisationId: number;
}) {
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [occupancies, setOccupancies] = useState<Occupancy[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);

  const [editing, setEditing] = useState<Position | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [occupancyTarget, setOccupancyTarget] = useState<Position | null>(null);
  const [occupancyMemberId, setOccupancyMemberId] = useState("");
  const [occupancyError, setOccupancyError] = useState<string | null>(null);
  const [occupancySaving, setOccupancySaving] = useState(false);
  const [occupancyHistory, setOccupancyHistory] = useState<Occupancy[] | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const [orgResult, hierarchyResult, occupancyResult, peopleResult] =
        await Promise.all([
          fetchOrganisation(organisationId),
          fetchHierarchy(organisationId),
          fetchOrganisationOccupancy(organisationId),
          fetchOrganisationPeople(organisationId),
        ]);

      setOrganisation(orgResult.organisation);
      setPositions(hierarchyResult.positions);
      setOccupancies(occupancyResult.occupancies);
      setMembers(peopleResult.members);
      setError(null);
      setForbidden(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setForbidden(true);
        setError(null);
      } else {
        setError(failureMessage(caught));
      }
    }
  }, [organisationId]);

  useEffect(() => {
    // Synchronising with an external system — the Yahzel API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const tree = useMemo(
    () => (positions ? buildPositionTree(positions) : []),
    [positions],
  );

  const memberById = useMemo(
    () => new Map((members ?? []).map((member) => [member.id, member])),
    [members],
  );

  const occupancyByPosition = useMemo(
    () =>
      new Map(
        (occupancies ?? [])
          .filter((occupancy) => occupancy.isActive)
          .map((occupancy) => [occupancy.positionId, occupancy]),
      ),
    [occupancies],
  );

  /**
   * The organisation's Head is the earliest-created root position — the one
   * migration 010/organisation.repository.ts's createOrganisationWithAdmin
   * always creates first, whatever it is renamed to afterward. `positions`
   * is already ordered by created_at ascending (hierarchy.repository.ts's
   * listPositions), so the first root encountered here is that one. This
   * never reads `designation` — occupying this position is what makes
   * somebody the Head, not a manually-set field.
   */
  const headPositionId = useMemo(
    () => positions?.find((position) => position.parentPositionId === null)?.id ?? null,
    [positions],
  );

  function memberDisplayName(member: Member): string {
    return (
      member.fullName ?? member.username ?? member.email ?? `Member #${member.id}`
    );
  }

  function getOccupancy(positionId: number): OccupancyDisplay {
    const occupancy = occupancyByPosition.get(positionId);
    const member = occupancy ? memberById.get(occupancy.memberId) : undefined;

    return {
      occupantName: member ? memberDisplayName(member) : null,
      isHeadPosition: positionId === headPositionId,
    };
  }

  const descendantNames =
    deleteTarget && positions
      ? collectSubtreeIds(positions, deleteTarget.id)
          .filter((id) => id !== deleteTarget.id)
          .map((id) => positions.find((position) => position.id === id)?.name)
          .filter((name): name is string => Boolean(name))
      : [];

  /**
   * Every position except `excludingId` and anything beneath it — offering
   * a descendant as a new parent would always be rejected by the backend as
   * a cycle, so the picker never shows a choice that cannot work.
   */
  function parentOptions(excludingId: number | null): Position[] {
    if (!positions) {
      return [];
    }

    if (excludingId === null) {
      return positions;
    }

    const excluded = new Set(collectSubtreeIds(positions, excludingId));

    return positions.filter((position) => !excluded.has(position.id));
  }

  function openAdd(parentPositionId: number | null) {
    setAddForm({
      name: "",
      parentPositionId:
        parentPositionId === null ? "" : String(parentPositionId),
    });
    setAddErrors({});
    setAddOpen(true);
  }

  async function submitAdd() {
    setAdding(true);
    setAddErrors({});

    try {
      await createPosition(organisationId, {
        name: addForm.name,
        parentPositionId: addForm.parentPositionId
          ? Number(addForm.parentPositionId)
          : null,
      });

      setAddOpen(false);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setAddErrors(caught.byField());
      }
    } finally {
      setAdding(false);
    }
  }

  function openEdit(position: Position) {
    setEditing(position);
    setEditForm({
      name: position.name,
      parentPositionId:
        position.parentPositionId === null
          ? ""
          : String(position.parentPositionId),
    });
    setEditErrors({});
  }

  async function submitEdit() {
    if (!editing) {
      return;
    }

    setSaving(true);
    setEditErrors({});

    try {
      await updatePosition(organisationId, editing.id, {
        name: editForm.name,
        parentPositionId: editForm.parentPositionId
          ? Number(editForm.parentPositionId)
          : null,
      });

      setEditing(null);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setEditErrors(caught.byField());
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      await deletePosition(organisationId, deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (caught) {
      setDeleteError(failureMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  async function openOccupancy(position: Position) {
    setOccupancyTarget(position);
    setOccupancyError(null);
    setOccupancyHistory(null);

    const current = occupancyByPosition.get(position.id);
    setOccupancyMemberId(current ? String(current.memberId) : "");

    try {
      const result = await fetchPositionOccupancyHistory(
        organisationId,
        position.id,
      );
      setOccupancyHistory(result.history);
    } catch {
      // History is a convenience, not required for assigning/ending an
      // occupant — the modal still works without it.
    }
  }

  async function submitOccupancy() {
    if (!occupancyTarget || !occupancyMemberId) {
      return;
    }

    setOccupancySaving(true);
    setOccupancyError(null);

    try {
      const current = occupancyByPosition.get(occupancyTarget.id);

      if (current) {
        await replaceOccupant(
          organisationId,
          occupancyTarget.id,
          Number(occupancyMemberId),
        );
      } else {
        await assignOccupant(
          organisationId,
          occupancyTarget.id,
          Number(occupancyMemberId),
        );
      }

      setOccupancyTarget(null);
      await load();
    } catch (caught) {
      setOccupancyError(
        caught instanceof ApiError
          ? (caught.forField("memberId") ?? caught.message)
          : failureMessage(caught),
      );
    } finally {
      setOccupancySaving(false);
    }
  }

  async function submitEndOccupancy() {
    if (!occupancyTarget) {
      return;
    }

    setOccupancySaving(true);
    setOccupancyError(null);

    try {
      await endOccupancy(organisationId, occupancyTarget.id);
      setOccupancyTarget(null);
      await load();
    } catch (caught) {
      setOccupancyError(failureMessage(caught));
    } finally {
      setOccupancySaving(false);
    }
  }

  if (forbidden) {
    return (
      <div className="space-y-3">
        <PageHeader title="Organisation Hierarchy" />

        <StatusMessage tone="error">
          Only an administrator can manage this organisation&apos;s hierarchy.{" "}
          <Link href="/work" className="font-bold underline underline-offset-4">
            Back to Work
          </Link>
        </StatusMessage>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <PageHeader title="Organisation Hierarchy" />

        <StatusMessage tone="error">
          {error}{" "}
          <button
            type="button"
            onClick={() => void load()}
            className="font-bold underline underline-offset-4"
          >
            Try again
          </button>
        </StatusMessage>
      </div>
    );
  }

  if (!positions || !organisation) {
    return <p className="text-[13px] text-yz-neutral-600">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Organisation Hierarchy"
        description={`${organisation.name} — positions and reporting relationships.`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/work"
              className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
            >
              Back to Work
            </Link>

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => openAdd(null)}
            >
              + Add position
            </Button>
          </div>
        }
      />

      <Panel>
        <PanelGroup title="Positions">
          {tree.length === 0 ? (
            <div className="py-3 text-center">
              <p className="mb-3 text-[13px] leading-6 text-yz-neutral-600">
                No positions have been created yet.
              </p>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => openAdd(null)}
              >
                + Add position
              </Button>
            </div>
          ) : (
            <OrgChart
              roots={tree}
              getOccupancy={getOccupancy}
              onAddChild={openAdd}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              onManageOccupant={(position) => void openOccupancy(position)}
            />
          )}
        </PanelGroup>
      </Panel>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add position">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitAdd();
          }}
          className="grid gap-3"
        >
          <TextField
            id="addPositionName"
            label="Position name"
            value={addForm.name}
            error={addErrors.name}
            onChange={(event) =>
              setAddForm((current) => ({ ...current, name: event.target.value }))
            }
          />

          <SelectField
            id="addPositionParent"
            label="Reports to"
            value={addForm.parentPositionId}
            error={addErrors.parentPositionId}
            onChange={(event) =>
              setAddForm((current) => ({
                ...current,
                parentPositionId: event.target.value,
              }))
            }
          >
            <option value="">None / root</option>

            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.name}
              </option>
            ))}
          </SelectField>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={adding}>
              {adding ? "Creating…" : "Create position"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={adding}
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit position"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitEdit();
          }}
          className="grid gap-3"
        >
          <TextField
            id="editPositionName"
            label="Position name"
            value={editForm.name}
            error={editErrors.name}
            onChange={(event) =>
              setEditForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />

          <SelectField
            id="editPositionParent"
            label="Reports to"
            value={editForm.parentPositionId}
            error={editErrors.parentPositionId}
            onChange={(event) =>
              setEditForm((current) => ({
                ...current,
                parentPositionId: event.target.value,
              }))
            }
          >
            <option value="">None / root</option>

            {editing &&
              parentOptions(editing.id).map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
          </SelectField>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete position?"}
      >
        {deleteError && (
          <StatusMessage tone="error" className="mb-3">
            {deleteError}
          </StatusMessage>
        )}

        {deleteTarget && descendantNames.length > 0 && (
          <div className="mb-3 rounded-sm border border-yz-danger-line bg-yz-danger-bg px-3.5 py-2.5">
            <p className="text-[12.5px] font-semibold text-yz-danger-ink">
              This will also delete:
            </p>

            <ul className="mt-1.5 list-disc pl-4 text-[12.5px] leading-6 text-yz-danger-ink">
              {descendantNames.map((name, index) => (
                <li key={`${name}-${index}`}>{name}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="mb-3 text-[13px] leading-6 text-yz-neutral-700">
          This action cannot be undone.
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
          >
            Cancel
          </Button>

          <Button
            variant="danger"
            onClick={() => void confirmDelete()}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={occupancyTarget !== null}
        onClose={() => setOccupancyTarget(null)}
        title={occupancyTarget ? `Occupant — ${occupancyTarget.name}` : "Occupant"}
      >
        {occupancyTarget && (
          <div className="space-y-3.5">
            {occupancyError && (
              <StatusMessage tone="error">{occupancyError}</StatusMessage>
            )}

            <p className="text-[13px] leading-6 text-yz-neutral-700">
              {occupancyByPosition.has(occupancyTarget.id) ? (
                <>
                  Currently occupied by{" "}
                  <span className="font-semibold text-yz-ink">
                    {getOccupancy(occupancyTarget.id).occupantName}
                  </span>
                  .
                </>
              ) : (
                "This position is vacant."
              )}
            </p>

            <SelectField
              id="occupancyMemberId"
              label={
                occupancyByPosition.has(occupancyTarget.id)
                  ? "Replace with"
                  : "Assign"
              }
              value={occupancyMemberId}
              onChange={(event) => setOccupancyMemberId(event.target.value)}
            >
              <option value="">Choose a person</option>

              {(members ?? [])
                .filter((member) => member.status === "active")
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {memberDisplayName(member)}
                  </option>
                ))}
            </SelectField>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={occupancySaving || !occupancyMemberId}
                onClick={() => void submitOccupancy()}
              >
                {occupancySaving
                  ? "Saving…"
                  : occupancyByPosition.has(occupancyTarget.id)
                    ? "Replace occupant"
                    : "Assign"}
              </Button>

              {occupancyByPosition.has(occupancyTarget.id) && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={occupancySaving}
                  onClick={() => void submitEndOccupancy()}
                >
                  End occupancy
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={occupancySaving}
                onClick={() => setOccupancyTarget(null)}
              >
                Cancel
              </Button>
            </div>

            {occupancyHistory && occupancyHistory.length > 0 && (
              <div className="border-t border-yz-neutral-200 pt-3">
                <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-yz-neutral-500">
                  History
                </p>

                <ul className="space-y-1 text-[12.5px] leading-tight text-yz-neutral-700">
                  {occupancyHistory.map((entry) => {
                    const historyMember = memberById.get(entry.memberId);

                    return (
                      <li key={entry.id}>
                        {historyMember
                          ? memberDisplayName(historyMember)
                          : `Member #${entry.memberId}`}
                        {" — "}
                        {new Date(entry.startsAt).toLocaleDateString()} to{" "}
                        {entry.endsAt
                          ? new Date(entry.endsAt).toLocaleDateString()
                          : "present"}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
