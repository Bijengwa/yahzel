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
  addDepartmentMember,
  buildHierarchyTree,
  collectSubtreeIds,
  createDepartment,
  createPosition,
  deleteDepartment,
  deletePosition,
  fetchDepartmentDetail,
  fetchHierarchy,
  removeDepartmentMember,
  updateDepartment,
  updatePosition,
  type Department,
  type DepartmentMember,
  type Position,
} from "@/lib/hierarchy";
import {
  fetchOrganisation,
  fetchOrganisationPeople,
  type Member,
  type Organisation,
} from "@/lib/organisation";
import { OrgChart } from "./org-chart";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

const EMPTY_POSITION_FORM = { name: "", parentPositionId: "" };
const EMPTY_DEPARTMENT_FORM = {
  name: "",
  parentPositionId: "",
  headPositionId: "",
};

/**
 * The organisation-scoped hierarchy workspace: a tree of positions and
 * departments and how they report to one another. This is admin tooling
 * only — the backend refuses anyone else, and this screen simply shows that
 * refusal in place rather than pretending the page does not exist.
 *
 * Positions carry no occupant; departments carry no member list in the tree
 * itself — only a head position and a compact count. See lib/hierarchy.ts's
 * buildHierarchyTree for how the two kinds of node share one tree, and the
 * department detail modal below for the only place a department's roster is
 * actually shown.
 */
export function HierarchyScreen({
  organisationId,
}: {
  organisationId: number;
}) {
  const [organisation, setOrganisation] = useState<Organisation | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_POSITION_FORM);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);

  const [editing, setEditing] = useState<Position | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_POSITION_FORM);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [addDeptOpen, setAddDeptOpen] = useState(false);
  const [addDeptForm, setAddDeptForm] = useState(EMPTY_DEPARTMENT_FORM);
  const [addDeptErrors, setAddDeptErrors] = useState<Record<string, string>>({});
  const [addingDept, setAddingDept] = useState(false);

  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editDeptForm, setEditDeptForm] = useState(EMPTY_DEPARTMENT_FORM);
  const [editDeptErrors, setEditDeptErrors] = useState<Record<string, string>>(
    {},
  );
  const [savingDept, setSavingDept] = useState(false);

  const [deleteDeptTarget, setDeleteDeptTarget] = useState<Department | null>(
    null,
  );
  const [deletingDept, setDeletingDept] = useState(false);
  const [deleteDeptError, setDeleteDeptError] = useState<string | null>(null);

  const [viewingDept, setViewingDept] = useState<Department | null>(null);
  const [deptMembers, setDeptMembers] = useState<DepartmentMember[] | null>(
    null,
  );
  const [deptDetailError, setDeptDetailError] = useState<string | null>(null);
  const [eligibleMembers, setEligibleMembers] = useState<Member[] | null>(null);
  const [addMemberId, setAddMemberId] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(
    null,
  );
  const [memberActionError, setMemberActionError] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const [orgResult, hierarchyResult] = await Promise.all([
        fetchOrganisation(organisationId),
        fetchHierarchy(organisationId),
      ]);

      setOrganisation(orgResult.organisation);
      setPositions(hierarchyResult.positions);
      setDepartments(hierarchyResult.departments);
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
    () =>
      positions && departments
        ? buildHierarchyTree(positions, departments)
        : [],
    [positions, departments],
  );

  /**
   * Positions currently heading a department: their own "Reports to" is
   * locked (see hierarchy.service.ts's updateHierarchyPosition guard) — the
   * edit-position modal below disables that field for exactly these ids
   * rather than letting the admin attempt a change the backend will reject.
   */
  const headPositionIds = useMemo(
    () =>
      new Set(
        (departments ?? [])
          .filter((department) => department.headPositionId !== null)
          .map((department) => department.headPositionId as number),
      ),
    [departments],
  );

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

  /* ---------------------------------------------------------- positions */

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

  /* --------------------------------------------------------- departments */

  function openAddDepartment(parentPositionId: number | null) {
    setAddDeptForm({
      name: "",
      parentPositionId:
        parentPositionId === null ? "" : String(parentPositionId),
      headPositionId: "",
    });
    setAddDeptErrors({});
    setAddDeptOpen(true);
  }

  async function submitAddDepartment() {
    setAddingDept(true);
    setAddDeptErrors({});

    try {
      await createDepartment(organisationId, {
        name: addDeptForm.name,
        parentPositionId: addDeptForm.parentPositionId
          ? Number(addDeptForm.parentPositionId)
          : null,
        headPositionId: addDeptForm.headPositionId
          ? Number(addDeptForm.headPositionId)
          : null,
      });

      setAddDeptOpen(false);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setAddDeptErrors(caught.byField());
      }
    } finally {
      setAddingDept(false);
    }
  }

  function openEditDepartment(department: Department) {
    setEditingDept(department);
    setEditDeptForm({
      name: department.name,
      parentPositionId:
        department.parentPositionId === null
          ? ""
          : String(department.parentPositionId),
      headPositionId:
        department.headPositionId === null
          ? ""
          : String(department.headPositionId),
    });
    setEditDeptErrors({});
  }

  async function submitEditDepartment() {
    if (!editingDept) {
      return;
    }

    setSavingDept(true);
    setEditDeptErrors({});

    try {
      await updateDepartment(organisationId, editingDept.id, {
        name: editDeptForm.name,
        parentPositionId: editDeptForm.parentPositionId
          ? Number(editDeptForm.parentPositionId)
          : null,
        headPositionId: editDeptForm.headPositionId
          ? Number(editDeptForm.headPositionId)
          : null,
      });

      setEditingDept(null);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setEditDeptErrors(caught.byField());
      }
    } finally {
      setSavingDept(false);
    }
  }

  async function confirmDeleteDepartment() {
    if (!deleteDeptTarget) {
      return;
    }

    setDeletingDept(true);
    setDeleteDeptError(null);

    try {
      await deleteDepartment(organisationId, deleteDeptTarget.id);
      setDeleteDeptTarget(null);
      await load();
    } catch (caught) {
      setDeleteDeptError(failureMessage(caught));
    } finally {
      setDeletingDept(false);
    }
  }

  async function openViewDepartment(department: Department) {
    setViewingDept(department);
    setDeptMembers(null);
    setDeptDetailError(null);
    setEligibleMembers(null);
    setAddMemberId("");
    setMemberActionError(null);

    try {
      const [detail, people] = await Promise.all([
        fetchDepartmentDetail(organisationId, department.id),
        fetchOrganisationPeople(organisationId),
      ]);

      setDeptMembers(detail.members);

      const seen = new Set<number>();
      const activePeople = [...people.administration, ...people.people].filter(
        (person) => {
          if (person.status !== "active" || seen.has(person.id)) {
            return false;
          }

          seen.add(person.id);
          return true;
        },
      );

      setEligibleMembers(activePeople);
    } catch (caught) {
      setDeptDetailError(failureMessage(caught));
    }
  }

  async function refreshDepartmentDetail(departmentId: number) {
    const detail = await fetchDepartmentDetail(organisationId, departmentId);
    setDeptMembers(detail.members);
    await load();
  }

  async function submitAddMember() {
    if (!viewingDept || !addMemberId) {
      return;
    }

    setAddingMember(true);
    setMemberActionError(null);

    try {
      await addDepartmentMember(
        organisationId,
        viewingDept.id,
        Number(addMemberId),
      );
      setAddMemberId("");
      await refreshDepartmentDetail(viewingDept.id);
    } catch (caught) {
      setMemberActionError(failureMessage(caught));
    } finally {
      setAddingMember(false);
    }
  }

  async function removeMember(memberId: number) {
    if (!viewingDept) {
      return;
    }

    setRemovingMemberId(memberId);
    setMemberActionError(null);

    try {
      await removeDepartmentMember(organisationId, viewingDept.id, memberId);
      await refreshDepartmentDetail(viewingDept.id);
    } catch (caught) {
      setMemberActionError(failureMessage(caught));
    } finally {
      setRemovingMemberId(null);
    }
  }

  const eligibleMembersNotOnRoster = (eligibleMembers ?? []).filter(
    (member) => !(deptMembers ?? []).some((row) => row.id === member.id),
  );

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

  if (!positions || !departments || !organisation) {
    return <p className="text-[13px] text-yz-neutral-600">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Organisation Hierarchy"
        description={`${organisation.name} — positions, departments and reporting relationships.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/work"
              className="text-[12px] font-bold text-yz-neutral-600 underline-offset-4 hover:text-yz-ink hover:underline"
            >
              Back to Work
            </Link>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => openAddDepartment(null)}
            >
              + Add department
            </Button>

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
        <PanelGroup title="Structure">
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
              onAddChild={openAdd}
              onAddDepartment={openAddDepartment}
              onEditPosition={openEdit}
              onDeletePosition={setDeleteTarget}
              onViewDepartment={(department) => void openViewDepartment(department)}
              onEditDepartment={openEditDepartment}
              onDeleteDepartment={setDeleteDeptTarget}
            />
          )}
        </PanelGroup>
      </Panel>

      {/* -------------------------------------------------- add position */}
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

      {/* ------------------------------------------------- edit position */}
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
            disabled={editing !== null && headPositionIds.has(editing.id)}
            hint={
              editing !== null && headPositionIds.has(editing.id)
                ? "This position heads a department, so its place in the tree comes from that department. Edit the department to move it."
                : undefined
            }
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

      {/* ----------------------------------------------- delete position */}
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

        {deleteTarget && headPositionIds.has(deleteTarget.id) && (
          <p className="mb-3 text-[12.5px] leading-6 text-yz-neutral-700">
            This position currently heads a department. Deleting it leaves
            that department without a head.
          </p>
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

      {/* ------------------------------------------------- add department */}
      <Modal
        open={addDeptOpen}
        onClose={() => setAddDeptOpen(false)}
        title="Add department"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitAddDepartment();
          }}
          className="grid gap-3"
        >
          <TextField
            id="addDepartmentName"
            label="Department name"
            value={addDeptForm.name}
            error={addDeptErrors.name}
            onChange={(event) =>
              setAddDeptForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />

          <SelectField
            id="addDepartmentParent"
            label="Reports to"
            value={addDeptForm.parentPositionId}
            error={addDeptErrors.parentPositionId}
            onChange={(event) =>
              setAddDeptForm((current) => ({
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

          <SelectField
            id="addDepartmentHead"
            label="Head position"
            value={addDeptForm.headPositionId}
            error={addDeptErrors.headPositionId}
            hint="Picking a position that already reports elsewhere moves it here."
            onChange={(event) =>
              setAddDeptForm((current) => ({
                ...current,
                headPositionId: event.target.value,
              }))
            }
          >
            <option value="">No head yet</option>

            {positions
              .filter((position) => !headPositionIds.has(position.id))
              .map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
          </SelectField>

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={addingDept}
            >
              {addingDept ? "Creating…" : "Create department"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={addingDept}
              onClick={() => setAddDeptOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* ------------------------------------------------ edit department */}
      <Modal
        open={editingDept !== null}
        onClose={() => setEditingDept(null)}
        title="Edit department"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitEditDepartment();
          }}
          className="grid gap-3"
        >
          <TextField
            id="editDepartmentName"
            label="Department name"
            value={editDeptForm.name}
            error={editDeptErrors.name}
            onChange={(event) =>
              setEditDeptForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />

          <SelectField
            id="editDepartmentParent"
            label="Reports to"
            value={editDeptForm.parentPositionId}
            error={editDeptErrors.parentPositionId}
            onChange={(event) =>
              setEditDeptForm((current) => ({
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

          <SelectField
            id="editDepartmentHead"
            label="Head position"
            value={editDeptForm.headPositionId}
            error={editDeptErrors.headPositionId}
            hint="Picking a position that already reports elsewhere moves it here."
            onChange={(event) =>
              setEditDeptForm((current) => ({
                ...current,
                headPositionId: event.target.value,
              }))
            }
          >
            <option value="">No head yet</option>

            {positions
              .filter(
                (position) =>
                  !headPositionIds.has(position.id) ||
                  (editingDept && position.id === editingDept.headPositionId),
              )
              .map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
          </SelectField>

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={savingDept}
            >
              {savingDept ? "Saving…" : "Save changes"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={savingDept}
              onClick={() => setEditingDept(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---------------------------------------------- delete department */}
      <Modal
        open={deleteDeptTarget !== null}
        onClose={() => setDeleteDeptTarget(null)}
        title={
          deleteDeptTarget
            ? `Delete "${deleteDeptTarget.name}"?`
            : "Delete department?"
        }
      >
        {deleteDeptError && (
          <StatusMessage tone="error" className="mb-3">
            {deleteDeptError}
          </StatusMessage>
        )}

        {deleteDeptTarget && (
          <p className="mb-3 text-[13px] leading-6 text-yz-neutral-700">
            Head: {deleteDeptTarget.headPositionName ?? "None"}
            <br />
            {deleteDeptTarget.memberCount} member
            {deleteDeptTarget.memberCount === 1 ? "" : "s"} will be removed
            from this department. The head position itself is not deleted —
            it simply becomes a root position.
          </p>
        )}

        <p className="mb-3 text-[13px] leading-6 text-yz-neutral-700">
          This action cannot be undone.
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => setDeleteDeptTarget(null)}
            disabled={deletingDept}
          >
            Cancel
          </Button>

          <Button
            variant="danger"
            onClick={() => void confirmDeleteDepartment()}
            disabled={deletingDept}
          >
            {deletingDept ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>

      {/* --------------------------------------------- department detail */}
      <Modal
        open={viewingDept !== null}
        onClose={() => setViewingDept(null)}
        title={viewingDept?.name ?? "Department"}
      >
        {viewingDept && (
          <div className="space-y-4">
            <p className="text-[13px] leading-6 text-yz-neutral-700">
              Head: {viewingDept.headPositionName ?? "No head assigned"}
            </p>

            {deptDetailError && (
              <StatusMessage tone="error">{deptDetailError}</StatusMessage>
            )}

            {memberActionError && (
              <StatusMessage tone="error">{memberActionError}</StatusMessage>
            )}

            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-yz-ink">
                Members ({deptMembers?.length ?? 0})
              </p>

              {deptMembers === null ? (
                <p className="text-[13px] text-yz-neutral-600">Loading…</p>
              ) : deptMembers.length === 0 ? (
                <p className="text-[13px] text-yz-neutral-600">
                  No members yet.
                </p>
              ) : (
                <ul className="divide-y divide-yz-neutral-200 rounded-sm border border-yz-neutral-200">
                  {deptMembers.map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                    >
                      <span className="text-[13px] text-yz-ink">
                        {member.fullName ?? member.username ?? member.email}
                        {member.title && (
                          <span className="ml-1.5 text-yz-neutral-500">
                            — {member.title}
                          </span>
                        )}
                      </span>

                      <button
                        type="button"
                        disabled={removingMemberId === member.id}
                        onClick={() => void removeMember(member.id)}
                        className="text-[12px] font-bold text-yz-danger-ink underline-offset-4 hover:underline disabled:opacity-50"
                      >
                        {removingMemberId === member.id
                          ? "Removing…"
                          : "Remove"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitAddMember();
              }}
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <SelectField
                  id="addDepartmentMember"
                  label="Add member"
                  value={addMemberId}
                  onChange={(event) => setAddMemberId(event.target.value)}
                >
                  <option value="">
                    {eligibleMembers === null
                      ? "Loading…"
                      : "Select a person"}
                  </option>

                  {eligibleMembersNotOnRoster.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName ?? member.username ?? member.email}
                    </option>
                  ))}
                </SelectField>
              </div>

              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={!addMemberId || addingMember}
              >
                {addingMember ? "Adding…" : "Add"}
              </Button>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}
