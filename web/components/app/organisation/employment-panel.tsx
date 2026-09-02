"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { StatusMessage } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import {
  createContract,
  createContractReviewWork,
  createEmploymentRecord,
  employmentStatusLabel,
  fetchContracts,
  fetchEmploymentForMember,
  loadEmploymentVocabulary,
  updateContract,
  updateEmploymentRecord,
  type Contract,
  type EmploymentForMember,
  type EmploymentTypeOption,
} from "@/lib/employment";
import type { Member } from "@/lib/organisation";

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return "—";
  }

  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusTone(status: string): "ok" | "muted" | "danger" {
  if (status === "active") {
    return "ok";
  }

  return status === "concluded" ? "danger" : "muted";
}

/**
 * A person's employment record and contracts, opened from their row in the
 * People panel. Position and department are never fields here — they are
 * read straight from `placement`, which the API already derives from the
 * existing occupancy/department data (see migration 018's own note).
 */
export function EmploymentPanel({
  organisationId,
  member,
  canAdminister,
  onClose,
}: {
  organisationId: number;
  member: Member;
  canAdminister: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<EmploymentForMember | null>(null);
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; message: string } | null>(
    null,
  );

  const [contractTypes, setContractTypes] = useState<EmploymentTypeOption[]>([]);

  const [creatingEmployment, setCreatingEmployment] = useState(false);
  const [editingEmployment, setEditingEmployment] = useState(false);
  const [addingContract, setAddingContract] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewWorkId, setReviewWorkId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchEmploymentForMember(organisationId, member.id);
      setData(result);
      setLoadError(null);

      if (result.employmentRecord) {
        const { contracts: list } = await fetchContracts(
          organisationId,
          result.employmentRecord.id,
        );
        setContracts(list);
      } else {
        setContracts(null);
      }
    } catch (caught) {
      setLoadError(failureMessage(caught));
    }
  }, [organisationId, member.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    loadEmploymentVocabulary()
      .then((vocabulary) => setContractTypes(vocabulary.contractTypes))
      .catch(() => {
        // The contract type picker falls back to the server default; every
        // value is validated server-side regardless.
      });
  }, [load]);

  const memberName = member.fullName ?? member.username ?? member.email ?? "This person";
  const activeContract = contracts?.find((contract) => contract.isActive) ?? null;

  return (
    <Modal
      open
      onClose={onClose}
      title={memberName}
      description="Employment record and contracts"
    >
      <div className="space-y-4">
        {loadError && <StatusMessage tone="error">{loadError}</StatusMessage>}

        {status && (
          <StatusMessage tone={status.tone}>{status.message}</StatusMessage>
        )}

        {data && (
          <>
            <section>
              <h3 className="mb-1.5 text-[12px] font-bold text-yz-neutral-600">
                Placement
              </h3>

              <p className="text-[13px] text-yz-ink">
                {data.placement.position
                  ? data.placement.position.name
                  : "No position assigned"}
              </p>

              <p className="mt-0.5 text-[12px] text-yz-neutral-600">
                {data.placement.departments.length > 0
                  ? data.placement.departments.map((d) => d.name).join(", ")
                  : "No department"}
              </p>

              <p className="mt-1.5 text-[11.5px] leading-5 text-yz-neutral-500">
                {member.designationLabel}
                {member.title ? ` · ${member.title}` : ""} — the
                organisation&apos;s own standing, separate from the position
                above.
              </p>
            </section>

            <section className="border-t border-yz-neutral-200 pt-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="text-[12px] font-bold text-yz-neutral-600">
                  Employment record
                </h3>

                {canAdminister && data.employmentRecord && !editingEmployment && (
                  <Button size="sm" variant="ghost" onClick={() => setEditingEmployment(true)}>
                    Edit
                  </Button>
                )}
              </div>

              {data.employmentRecord ? (
                <div className="text-[13px] text-yz-ink">
                  <div className="flex items-center gap-2">
                    <StatusPill tone={statusTone(data.employmentRecord.employmentStatus)}>
                      {employmentStatusLabel(data.employmentRecord.employmentStatus)}
                    </StatusPill>

                    <span className="text-[12px] text-yz-neutral-600">
                      {formatDate(data.employmentRecord.startDate)} —{" "}
                      {data.employmentRecord.endDate
                        ? formatDate(data.employmentRecord.endDate)
                        : "Present"}
                    </span>
                  </div>

                  {data.employmentRecord.notes && (
                    <p className="mt-1.5 text-[12px] leading-5 text-yz-neutral-600">
                      {data.employmentRecord.notes}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-[12.5px] leading-6 text-yz-neutral-600">
                    No current employment record.
                  </p>

                  {canAdminister && !creatingEmployment && (
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => setCreatingEmployment(true)}
                    >
                      Add employment record
                    </Button>
                  )}
                </div>
              )}

              {editingEmployment && data.employmentRecord && (
                <EditEmploymentForm
                  employmentRecord={data.employmentRecord}
                  busy={busy}
                  onCancel={() => setEditingEmployment(false)}
                  onSave={async (patch) => {
                    setBusy(true);
                    setStatus(null);

                    try {
                      const { message } = await updateEmploymentRecord(
                        organisationId,
                        data.employmentRecord!.id,
                        patch,
                      );

                      setStatus({ tone: "ok", message });
                      setEditingEmployment(false);
                      await load();
                    } catch (caught) {
                      setStatus({ tone: "error", message: failureMessage(caught) });
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              )}

              {creatingEmployment && (
                <CreateEmploymentForm
                  busy={busy}
                  onCancel={() => setCreatingEmployment(false)}
                  onSave={async (input) => {
                    setBusy(true);
                    setStatus(null);

                    try {
                      const { message } = await createEmploymentRecord(
                        organisationId,
                        member.id,
                        input,
                      );

                      setStatus({ tone: "ok", message });
                      setCreatingEmployment(false);
                      await load();
                    } catch (caught) {
                      setStatus({ tone: "error", message: failureMessage(caught) });
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              )}
            </section>

            {data.employmentRecord && (
              <section className="border-t border-yz-neutral-200 pt-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <h3 className="text-[12px] font-bold text-yz-neutral-600">
                    Contracts
                  </h3>

                  {canAdminister && !activeContract && !addingContract && (
                    <Button size="sm" variant="ghost" onClick={() => setAddingContract(true)}>
                      Add contract
                    </Button>
                  )}
                </div>

                {contracts === null ? (
                  <p className="text-[12.5px] text-yz-neutral-600">Loading…</p>
                ) : contracts.length === 0 ? (
                  <p className="text-[12.5px] leading-6 text-yz-neutral-600">
                    No contracts yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-yz-neutral-200">
                    {contracts.map((contract) => (
                      <li
                        key={contract.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-yz-ink">
                            {contract.contractTypeLabel}
                          </span>

                          <span className="block text-[12px] text-yz-neutral-600">
                            {formatDate(contract.startDate)} —{" "}
                            {contract.endDate ? formatDate(contract.endDate) : "Present"}
                          </span>
                        </span>

                        <span className="flex shrink-0 items-center gap-2">
                          <StatusPill tone={contract.isActive ? "ok" : "muted"}>
                            {contract.isActive ? "Active" : "Ended"}
                          </StatusPill>

                          {canAdminister && contract.isActive && contract.endDate && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                setStatus(null);
                                setReviewWorkId(null);

                                try {
                                  const { message, workItem } =
                                    await createContractReviewWork(
                                      organisationId,
                                      contract.id,
                                      "review",
                                    );

                                  setStatus({ tone: "ok", message });
                                  setReviewWorkId(workItem.id);
                                } catch (caught) {
                                  setStatus({
                                    tone: "error",
                                    message: failureMessage(caught),
                                  });
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Create review work
                            </Button>
                          )}

                          {canAdminister && contract.isActive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                setStatus(null);

                                try {
                                  const { message } = await updateContract(
                                    organisationId,
                                    data.employmentRecord!.id,
                                    contract.id,
                                    { status: "ended" },
                                  );

                                  setStatus({ tone: "ok", message });
                                  await load();
                                } catch (caught) {
                                  setStatus({
                                    tone: "error",
                                    message: failureMessage(caught),
                                  });
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              End
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {reviewWorkId && (
                  <p className="mt-2 text-[12.5px] text-yz-neutral-600">
                    <Link
                      href={`/work/${reviewWorkId}`}
                      className="font-semibold text-yz-ink underline underline-offset-4"
                    >
                      Open the review work item →
                    </Link>
                  </p>
                )}

                {addingContract && (
                  <CreateContractForm
                    contractTypes={contractTypes}
                    busy={busy}
                    onCancel={() => setAddingContract(false)}
                    onSave={async (input) => {
                      setBusy(true);
                      setStatus(null);

                      try {
                        const { message } = await createContract(
                          organisationId,
                          data.employmentRecord!.id,
                          input,
                        );

                        setStatus({ tone: "ok", message });
                        setAddingContract(false);
                        await load();
                      } catch (caught) {
                        setStatus({ tone: "error", message: failureMessage(caught) });
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                )}
              </section>
            )}
          </>
        )}

        <div className="flex justify-end border-t border-yz-neutral-200 pt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CreateEmploymentForm({
  busy,
  onCancel,
  onSave,
}: {
  busy: boolean;
  onCancel: () => void;
  onSave: (input: { startDate: string; notes: string | null }) => void;
}) {
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form
      className="mt-3 rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ startDate, notes: notes || null });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id="employmentStartDate"
          label="Start date"
          type="date"
          required
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
      </div>

      <div className="mt-3">
        <TextAreaField
          id="employmentNotes"
          label="Notes (optional)"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Create"}
        </Button>

        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EditEmploymentForm({
  employmentRecord,
  busy,
  onCancel,
  onSave,
}: {
  employmentRecord: { employmentStatus: string; endDate: string | null; notes: string | null };
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: {
    employmentStatus: string;
    endDate: string | null;
    notes: string | null;
  }) => void;
}) {
  const [employmentStatus, setEmploymentStatus] = useState(
    employmentRecord.employmentStatus,
  );
  const [endDate, setEndDate] = useState(toDateInput(employmentRecord.endDate));
  const [notes, setNotes] = useState(employmentRecord.notes ?? "");

  return (
    <form
      className="mt-3 rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ employmentStatus, endDate: endDate || null, notes: notes || null });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          id="employmentStatus"
          label="Employment status"
          value={employmentStatus}
          onChange={(event) => setEmploymentStatus(event.target.value)}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="concluded">Concluded</option>
        </SelectField>

        <TextField
          id="employmentEndDate"
          label="End date"
          type="date"
          hint="Leave blank while employment continues."
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
      </div>

      <div className="mt-3">
        <TextAreaField
          id="employmentNotesEdit"
          label="Notes (optional)"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>

        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CreateContractForm({
  contractTypes,
  busy,
  onCancel,
  onSave,
}: {
  contractTypes: EmploymentTypeOption[];
  busy: boolean;
  onCancel: () => void;
  onSave: (input: {
    contractType: string;
    startDate: string;
    endDate: string | null;
  }) => void;
}) {
  const [contractType, setContractType] = useState("permanent");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const options =
    contractTypes.length > 0
      ? contractTypes
      : [
          { value: "permanent", label: "Permanent" },
          { value: "fixed_term", label: "Fixed-term" },
          { value: "probation", label: "Probation" },
          { value: "consultancy", label: "Consultancy" },
          { value: "other", label: "Other" },
        ];

  return (
    <form
      className="mt-3 rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 p-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ contractType, startDate, endDate: endDate || null });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          id="contractType"
          label="Contract type"
          value={contractType}
          onChange={(event) => setContractType(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <TextField
          id="contractStartDate"
          label="Start date"
          type="date"
          required
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />

        <TextField
          id="contractEndDate"
          label="End date (optional)"
          type="date"
          hint="For a fixed-term contract's known end date."
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Add contract"}
        </Button>

        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
