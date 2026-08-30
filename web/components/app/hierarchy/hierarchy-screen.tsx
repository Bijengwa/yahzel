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
  buildPositionTree,
  collectSubtreeIds,
  createPosition,
  deletePosition,
  fetchHierarchy,
  updatePosition,
  type Position,
} from "@/lib/hierarchy";
import { fetchOrganisation, type Organisation } from "@/lib/organisation";
import { PositionNodeRow } from "./position-node";

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

  const load = useCallback(async () => {
    try {
      const [orgResult, hierarchyResult] = await Promise.all([
        fetchOrganisation(organisationId),
        fetchHierarchy(organisationId),
      ]);

      setOrganisation(orgResult.organisation);
      setPositions(hierarchyResult.positions);
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

  const descendantCount =
    deleteTarget && positions
      ? collectSubtreeIds(positions, deleteTarget.id).length - 1
      : 0;

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
            <ul className="space-y-1">
              {tree.map((node) => (
                <PositionNodeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  onAddChild={openAdd}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
            </ul>
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
        title="Delete position?"
        description={
          deleteTarget
            ? descendantCount > 0
              ? `This will also delete ${descendantCount} sub-position${
                  descendantCount === 1 ? "" : "s"
                } beneath ${deleteTarget.name}. This cannot be undone.`
              : `This will delete ${deleteTarget.name}. This cannot be undone.`
            : undefined
        }
      >
        {deleteError && (
          <StatusMessage tone="error" className="mb-3">
            {deleteError}
          </StatusMessage>
        )}

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
    </div>
  );
}
