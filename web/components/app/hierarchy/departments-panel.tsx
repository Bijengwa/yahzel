"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PanelGroup, StatusMessage } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import {
  addDepartmentMember,
  createDepartment,
  deleteDepartment,
  fetchDepartmentMembers,
  removeDepartmentMember,
  updateDepartment,
  type DepartmentMember,
  type DepartmentSummary,
} from "@/lib/departments";
import type { Position } from "@/lib/hierarchy";
import type { Member } from "@/lib/organisation";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

function memberDisplayName(member: Member): string {
  return (
    member.fullName ?? member.username ?? member.email ?? `Member #${member.id}`
  );
}

const EMPTY_FORM = { name: "", headPositionId: "" };

/**
 * The departments management section of the hierarchy workspace. A department
 * is its own concept — a named group of people, optionally led by one of the
 * organisation's positions — kept separate from positions and occupancy.
 *
 * The members view modal is controlled by the parent (`membersTarget`) so the
 * same view opens both from a row here and from a department badge in the org
 * chart: members are always seen *through* the department, never as tree
 * nodes.
 */
export function DepartmentsPanel({
  organisationId,
  departments,
  positions,
  members,
  isAdmin,
  onChanged,
  membersTarget,
  onOpenMembers,
  onCloseMembers,
}: {
  organisationId: number;
  departments: DepartmentSummary[];
  positions: Position[];
  members: Member[];
  isAdmin: boolean;
  onChanged: () => Promise<void>;
  membersTarget: DepartmentSummary | null;
  onOpenMembers: (department: DepartmentSummary) => void;
  onCloseMembers: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);

  const [editing, setEditing] = useState<DepartmentSummary | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DepartmentSummary | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [departmentMembers, setDepartmentMembers] = useState<
    DepartmentMember[] | null
  >(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [addMemberId, setAddMemberId] = useState("");
  const [memberBusy, setMemberBusy] = useState(false);

  const positionName = useCallback(
    (positionId: number | null) =>
      positionId === null
        ? null
        : (positions.find((position) => position.id === positionId)?.name ??
          null),
    [positions],
  );

  const loadMembers = useCallback(
    async (departmentId: number) => {
      setDepartmentMembers(null);
      setMembersError(null);
      setAddMemberId("");

      try {
        const result = await fetchDepartmentMembers(
          organisationId,
          departmentId,
        );
        setDepartmentMembers(result.members);
      } catch (caught) {
        setDepartmentMembers(null);
        setMembersError(failureMessage(caught));
      }
    },
    [organisationId],
  );

  useEffect(() => {
    if (!membersTarget) {
      return;
    }

    // Synchronising with an external system — the Yahzel API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMembers(membersTarget.id);
  }, [membersTarget, loadMembers]);

  function openAdd() {
    setAddForm(EMPTY_FORM);
    setAddErrors({});
    setAddOpen(true);
  }

  async function submitAdd() {
    setAdding(true);
    setAddErrors({});

    try {
      await createDepartment(organisationId, {
        name: addForm.name,
        headPositionId: addForm.headPositionId
          ? Number(addForm.headPositionId)
          : null,
      });

      setAddOpen(false);
      await onChanged();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setAddErrors(caught.byField());
      }
    } finally {
      setAdding(false);
    }
  }

  function openEdit(department: DepartmentSummary) {
    setEditing(department);
    setEditForm({
      name: department.name,
      headPositionId:
        department.headPositionId === null
          ? ""
          : String(department.headPositionId),
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
      await updateDepartment(organisationId, editing.id, {
        name: editForm.name,
        headPositionId: editForm.headPositionId
          ? Number(editForm.headPositionId)
          : null,
      });

      setEditing(null);
      await onChanged();
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
      await deleteDepartment(organisationId, deleteTarget.id);
      setDeleteTarget(null);
      await onChanged();
    } catch (caught) {
      setDeleteError(failureMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  async function submitAddMember() {
    if (!membersTarget || !addMemberId) {
      return;
    }

    setMemberBusy(true);
    setMembersError(null);

    try {
      await addDepartmentMember(
        organisationId,
        membersTarget.id,
        Number(addMemberId),
      );
      setAddMemberId("");
      await loadMembers(membersTarget.id);
      await onChanged();
    } catch (caught) {
      setMembersError(
        caught instanceof ApiError
          ? (caught.forField("memberId") ?? caught.message)
          : failureMessage(caught),
      );
    } finally {
      setMemberBusy(false);
    }
  }

  async function submitRemoveMember(memberId: number) {
    if (!membersTarget) {
      return;
    }

    setMemberBusy(true);
    setMembersError(null);

    try {
      await removeDepartmentMember(organisationId, membersTarget.id, memberId);
      await loadMembers(membersTarget.id);
      await onChanged();
    } catch (caught) {
      setMembersError(failureMessage(caught));
    } finally {
      setMemberBusy(false);
    }
  }

  // People eligible to be added: active members not already in the department.
  const currentMemberIds = useMemo(
    () => new Set((departmentMembers ?? []).map((member) => member.memberId)),
    [departmentMembers],
  );

  const addableMembers = members.filter(
    (member) => member.status === "active" && !currentMemberIds.has(member.id),
  );

  return (
    <PanelGroup
      title="Departments"
      trailing={
        isAdmin ? (
          <Button type="button" variant="secondary" size="sm" onClick={openAdd}>
            + Add department
          </Button>
        ) : undefined
      }
    >
      {departments.length === 0 ? (
        <p className="text-[13px] leading-6 text-yz-neutral-600">
          No departments have been created yet.
        </p>
      ) : (
        <ul className="divide-y divide-yz-neutral-200">
          {departments.map((department) => (
            <li
              key={department.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-yz-ink">
                  {department.name}
                </div>

                <div className="mt-0.5 text-[12px] leading-5 text-yz-neutral-600">
                  {department.headPositionName ??
                    positionName(department.headPositionId) ??
                    "No head position"}{" "}
                  · {department.memberCount}{" "}
                  {department.memberCount === 1 ? "person" : "people"}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenMembers(department)}
                >
                  Members
                </Button>

                {isAdmin && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(department)}
                    >
                      Edit
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(department)}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add department"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitAdd();
          }}
          className="grid gap-3"
        >
          <TextField
            id="addDepartmentName"
            label="Department name"
            value={addForm.name}
            error={addErrors.name}
            onChange={(event) =>
              setAddForm((current) => ({ ...current, name: event.target.value }))
            }
          />

          <SelectField
            id="addDepartmentHead"
            label="Head position"
            value={addForm.headPositionId}
            error={addErrors.headPositionId}
            onChange={(event) =>
              setAddForm((current) => ({
                ...current,
                headPositionId: event.target.value,
              }))
            }
          >
            <option value="">No head position</option>

            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.name}
              </option>
            ))}
          </SelectField>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={adding}>
              {adding ? "Creating…" : "Create department"}
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
        title="Edit department"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitEdit();
          }}
          className="grid gap-3"
        >
          <TextField
            id="editDepartmentName"
            label="Department name"
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
            id="editDepartmentHead"
            label="Head position"
            value={editForm.headPositionId}
            error={editErrors.headPositionId}
            onChange={(event) =>
              setEditForm((current) => ({
                ...current,
                headPositionId: event.target.value,
              }))
            }
          >
            <option value="">No head position</option>

            {positions.map((position) => (
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
        title={
          deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete department?"
        }
      >
        {deleteError && (
          <StatusMessage tone="error" className="mb-3">
            {deleteError}
          </StatusMessage>
        )}

        <p className="mb-3 text-[13px] leading-6 text-yz-neutral-700">
          The department and its member links will be removed. This action
          cannot be undone.
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
        open={membersTarget !== null}
        onClose={onCloseMembers}
        title={
          membersTarget ? `${membersTarget.name} — members` : "Department members"
        }
      >
        {membersTarget && (
          <div className="space-y-3.5">
            {membersError && (
              <StatusMessage tone="error">{membersError}</StatusMessage>
            )}

            {departmentMembers === null && !membersError ? (
              <p className="text-[13px] text-yz-neutral-600">Loading…</p>
            ) : departmentMembers && departmentMembers.length === 0 ? (
              <p className="text-[13px] leading-6 text-yz-neutral-600">
                No one has been added to this department yet.
              </p>
            ) : (
              <ul className="divide-y divide-yz-neutral-200">
                {(departmentMembers ?? []).map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-2 py-2 first:pt-0"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-yz-ink">
                        {member.name ?? member.email}
                      </div>

                      <div className="mt-0.5 truncate text-[12px] leading-5 text-yz-neutral-600">
                        {[
                          member.title,
                          member.designation,
                          member.email,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>

                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={memberBusy}
                        onClick={() => void submitRemoveMember(member.memberId)}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {isAdmin && (
              <div className="border-t border-yz-neutral-200 pt-3">
                <SelectField
                  id="addDepartmentMember"
                  label="Add a person"
                  value={addMemberId}
                  onChange={(event) => setAddMemberId(event.target.value)}
                >
                  <option value="">Choose a person</option>

                  {addableMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {memberDisplayName(member)}
                    </option>
                  ))}
                </SelectField>

                <div className="mt-2.5 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={memberBusy || !addMemberId}
                    onClick={() => void submitAddMember()}
                  >
                    {memberBusy ? "Adding…" : "Add member"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCloseMembers}
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </PanelGroup>
  );
}
