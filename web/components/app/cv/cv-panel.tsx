"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Panel, PanelGroup, StatusMessage } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError } from "@/lib/api";
import {
  addCertification,
  addEducation,
  addSkill,
  downloadCv,
  exportCv,
  fetchCv,
  removeCertification,
  removeEducation,
  removeSkill,
  updateCertification,
  updateEducation,
  type Certification,
  type CertificationInput,
  type Cv,
  type Education,
  type EducationInput,
} from "@/lib/cv";
import { formatMonthYear } from "@/lib/format";
import { saveProfile } from "@/lib/profile";
import { useProfile } from "../profile/profile-provider";

type Status = { tone: "ok" | "error"; message: string } | null;

function failureMessage(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : "Something went wrong. Please try again.";
}

const EMPTY_EDUCATION_FORM: EducationInput = {
  institution: "",
  degree: "",
  fieldOfStudy: "",
  startDate: "",
  endDate: "",
};

const EMPTY_CERTIFICATION_FORM: CertificationInput = {
  name: "",
  issuingOrganisation: "",
  issuedAt: "",
  expiresAt: "",
  credentialUrl: "",
};

function HeadlineSummarySection() {
  const { profile, applyProfile } = useProfile();

  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState(profile?.headline ?? "");
  const [summary, setSummary] = useState(profile?.summary ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  if (!profile) {
    return null;
  }

  const startEditing = () => {
    setHeadline(profile.headline ?? "");
    setSummary(profile.summary ?? "");
    setStatus(null);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);

    try {
      const { profile: updated } = await saveProfile({ headline: headline || null, summary: summary || null });
      applyProfile(updated);
      setEditing(false);
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <PanelGroup
        title="Headline & summary"
        trailing={
          !editing && (
            <Button variant="secondary" size="sm" onClick={startEditing}>
              Edit
            </Button>
          )
        }
      >
        {status && <StatusMessage tone={status.tone} className="mb-3">{status.message}</StatusMessage>}

        {editing ? (
          <div className="space-y-3">
            <TextField
              id="cvHeadline"
              label="Headline"
              placeholder="e.g. Backend Engineer"
              value={headline}
              onChange={(event) => setHeadline(event.target.value)}
            />
            <TextAreaField
              id="cvSummary"
              label="Professional summary"
              rows={4}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[15px] font-bold text-yz-ink">
              {profile.headline || <span className="font-normal text-yz-neutral-500">No headline yet.</span>}
            </p>
            <p className="mt-1.5 text-[13px] leading-6 text-yz-neutral-700">
              {profile.summary || <span className="text-yz-neutral-500">No professional summary yet.</span>}
            </p>
          </div>
        )}
      </PanelGroup>
    </Panel>
  );
}

function SkillsSection({ cv, onChange }: { cv: Cv; onChange: () => void }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setStatus(null);

    try {
      await addSkill(name.trim());
      setName("");
      onChange();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    setStatus(null);

    try {
      await removeSkill(id);
      onChange();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <PanelGroup title="Skills">
        {status && <StatusMessage tone={status.tone} className="mb-3">{status.message}</StatusMessage>}

        {cv.skills.length === 0 ? (
          <p className="text-[13px] text-yz-neutral-500">No skills added yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {cv.skills.map((skill) => (
              <span
                key={skill.id}
                className="inline-flex items-center gap-1.5 rounded-sm border border-yz-neutral-300 bg-yz-neutral-100 px-2.5 py-1 text-[12px] font-semibold text-yz-ink"
              >
                {skill.name}
                <button
                  type="button"
                  aria-label={`Remove ${skill.name}`}
                  onClick={() => void remove(skill.id)}
                  disabled={busy}
                  className="text-yz-neutral-500 hover:text-yz-danger-ink"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
          className="mt-3 flex items-end gap-2"
        >
          <div className="max-w-xs flex-1">
            <TextField
              id="newSkill"
              label="Add a skill"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>
            Add
          </Button>
        </form>
      </PanelGroup>
    </Panel>
  );
}

function EducationSection({ cv, onChange }: { cv: Cv; onChange: () => void }) {
  const [form, setForm] = useState<EducationInput>(EMPTY_EDUCATION_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const startEdit = (entry: Education) => {
    setEditingId(entry.id);
    setForm({
      institution: entry.institution,
      degree: entry.degree ?? "",
      fieldOfStudy: entry.fieldOfStudy ?? "",
      startDate: entry.startDate?.slice(0, 10) ?? "",
      endDate: entry.endDate?.slice(0, 10) ?? "",
    });
  };

  const cancel = () => {
    setEditingId(null);
    setForm(EMPTY_EDUCATION_FORM);
  };

  const submit = async () => {
    if (!form.institution.trim()) return;
    setBusy(true);
    setStatus(null);

    try {
      if (editingId === null) {
        await addEducation(form);
      } else {
        await updateEducation(editingId, form);
      }
      cancel();
      onChange();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    setStatus(null);

    try {
      await removeEducation(id);
      if (editingId === id) cancel();
      onChange();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <PanelGroup title="Education">
        {status && <StatusMessage tone={status.tone} className="mb-3">{status.message}</StatusMessage>}

        {cv.education.length === 0 ? (
          <p className="text-[13px] text-yz-neutral-500">No education added yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {cv.education.filter((e): e is Education => e !== null).map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 border-b border-yz-neutral-200 pb-2.5 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-yz-ink">
                    {entry.degree ? `${entry.degree}, ${entry.institution}` : entry.institution}
                  </p>
                  {entry.fieldOfStudy && <p className="text-[12px] text-yz-neutral-600">{entry.fieldOfStudy}</p>}
                  <p className="text-[12px] text-yz-neutral-500">
                    {formatMonthYear(entry.startDate) ?? "?"} – {formatMonthYear(entry.endDate) ?? "Present"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(entry)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void remove(entry.id)} disabled={busy}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-3 space-y-2.5 border-t border-yz-neutral-200 pt-3"
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            <TextField
              id="eduInstitution"
              label="Institution"
              value={form.institution}
              onChange={(event) => setForm({ ...form, institution: event.target.value })}
            />
            <TextField
              id="eduDegree"
              label="Degree"
              hint="Optional."
              value={form.degree ?? ""}
              onChange={(event) => setForm({ ...form, degree: event.target.value })}
            />
            <TextField
              id="eduField"
              label="Field of study"
              hint="Optional."
              value={form.fieldOfStudy ?? ""}
              onChange={(event) => setForm({ ...form, fieldOfStudy: event.target.value })}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <TextField
                id="eduStart"
                label="Start"
                type="date"
                value={form.startDate ?? ""}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              />
              <TextField
                id="eduEnd"
                label="End"
                type="date"
                hint="Blank = in progress."
                value={form.endDate ?? ""}
                onChange={(event) => setForm({ ...form, endDate: event.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editingId !== null && (
              <Button variant="secondary" size="sm" onClick={cancel} disabled={busy}>
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" disabled={busy || !form.institution.trim()}>
              {editingId === null ? "Add education" : "Save changes"}
            </Button>
          </div>
        </form>
      </PanelGroup>
    </Panel>
  );
}

function CertificationsSection({ cv, onChange }: { cv: Cv; onChange: () => void }) {
  const [form, setForm] = useState<CertificationInput>(EMPTY_CERTIFICATION_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const startEdit = (entry: Certification) => {
    setEditingId(entry.id);
    setForm({
      name: entry.name,
      issuingOrganisation: entry.issuingOrganisation ?? "",
      issuedAt: entry.issuedAt?.slice(0, 10) ?? "",
      expiresAt: entry.expiresAt?.slice(0, 10) ?? "",
      credentialUrl: entry.credentialUrl ?? "",
    });
  };

  const cancel = () => {
    setEditingId(null);
    setForm(EMPTY_CERTIFICATION_FORM);
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    setStatus(null);

    try {
      if (editingId === null) {
        await addCertification(form);
      } else {
        await updateCertification(editingId, form);
      }
      cancel();
      onChange();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    setStatus(null);

    try {
      await removeCertification(id);
      if (editingId === id) cancel();
      onChange();
    } catch (caught) {
      setStatus({ tone: "error", message: failureMessage(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <PanelGroup title="Certifications">
        {status && <StatusMessage tone={status.tone} className="mb-3">{status.message}</StatusMessage>}

        {cv.certifications.length === 0 ? (
          <p className="text-[13px] text-yz-neutral-500">No certifications added yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {cv.certifications.filter((c): c is Certification => c !== null).map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 border-b border-yz-neutral-200 pb-2.5 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-yz-ink">{entry.name}</p>
                  {entry.issuingOrganisation && (
                    <p className="text-[12px] text-yz-neutral-600">{entry.issuingOrganisation}</p>
                  )}
                  {entry.credentialUrl && (
                    <a
                      href={entry.credentialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-yz-accent underline"
                    >
                      View credential
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(entry)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void remove(entry.id)} disabled={busy}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-3 space-y-2.5 border-t border-yz-neutral-200 pt-3"
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            <TextField
              id="certName"
              label="Certification"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <TextField
              id="certIssuer"
              label="Issuing organisation"
              hint="Optional."
              value={form.issuingOrganisation ?? ""}
              onChange={(event) => setForm({ ...form, issuingOrganisation: event.target.value })}
            />
            <TextField
              id="certUrl"
              label="Credential URL"
              hint="Optional."
              value={form.credentialUrl ?? ""}
              onChange={(event) => setForm({ ...form, credentialUrl: event.target.value })}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <TextField
                id="certIssued"
                label="Issued"
                type="date"
                value={form.issuedAt ?? ""}
                onChange={(event) => setForm({ ...form, issuedAt: event.target.value })}
              />
              <TextField
                id="certExpires"
                label="Expires"
                type="date"
                hint="Optional."
                value={form.expiresAt ?? ""}
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editingId !== null && (
              <Button variant="secondary" size="sm" onClick={cancel} disabled={busy}>
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" disabled={busy || !form.name.trim()}>
              {editingId === null ? "Add certification" : "Save changes"}
            </Button>
          </div>
        </form>
      </PanelGroup>
    </Panel>
  );
}

function ExperienceSection({ cv }: { cv: Cv }) {
  return (
    <Panel>
      <PanelGroup title="Experience">
        {cv.experience.length === 0 ? (
          <p className="text-[13px] text-yz-neutral-500">
            No organisations yet. Join or create one to start building your record.
          </p>
        ) : (
          <ul className="space-y-3">
            {cv.experience.map((entry) => (
              <li key={entry.organisationId} className="border-b border-yz-neutral-200 pb-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-bold text-yz-ink">
                    {entry.organisationName}
                    <span className="ml-2 font-normal text-yz-neutral-600">
                      {entry.title ?? entry.designation}
                    </span>
                  </p>
                  <StatusPill tone={entry.status === "active" ? "ok" : "muted"}>
                    {entry.status === "active" ? "Current" : "Past"}
                  </StatusPill>
                </div>
                <p className="mt-0.5 text-[12px] text-yz-neutral-500">
                  {formatMonthYear(entry.joinedAt) ?? "?"} – {formatMonthYear(entry.leftAt) ?? "Present"}
                </p>
                {entry.positions.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {entry.positions.map((position, index) => (
                      <li key={index} className="text-[12px] text-yz-neutral-700">
                        {position.positionName ?? "Position"} ·{" "}
                        {formatMonthYear(position.startsAt) ?? "?"} –{" "}
                        {formatMonthYear(position.endsAt) ?? "Present"}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </PanelGroup>
    </Panel>
  );
}

function VerifiedWorkSection({ cv }: { cv: Cv }) {
  return (
    <Panel>
      <PanelGroup
        title="Verified work"
        trailing={
          <span className="text-[11px] font-semibold text-yz-neutral-500">
            Only work with an accepted report appears here
          </span>
        }
      >
        {cv.verifiedWork.length === 0 ? (
          <p className="text-[13px] text-yz-neutral-500">
            No verified work yet. Submit a work report and have it accepted to build your record.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {cv.verifiedWork.map((work) => (
              <li key={work.reportId} className="border-b border-yz-neutral-200 pb-2.5 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-yz-ink">{work.title}</p>
                  <StatusPill tone="ok">Verified</StatusPill>
                </div>
                <p className="text-[12px] text-yz-neutral-500">
                  {work.organisationName} · reviewed {formatMonthYear(work.reviewedAt) ?? "?"}
                </p>
                <p className="mt-1 text-[12.5px] leading-5 text-yz-neutral-700">{work.whatWasDone}</p>
              </li>
            ))}
          </ul>
        )}
      </PanelGroup>
    </Panel>
  );
}

export function CvPanel({ profileId }: { profileId: number }) {
  const [cv, setCv] = useState<Cv | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { cv: data } = await fetchCv(profileId);
      setCv(data);
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

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);

    try {
      const result = await exportCv(profileId);
      downloadCv(result);
    } catch (caught) {
      setExportError(failureMessage(caught));
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <p className="text-[13px] text-yz-neutral-600">Loading your CV…</p>;
  }

  if (error) {
    return <StatusMessage tone="error">{error}</StatusMessage>;
  }

  if (!cv) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {exportError && <StatusMessage tone="error">{exportError}</StatusMessage>}
        <Button variant="secondary" size="sm" onClick={() => void handleExport()} disabled={exporting}>
          {exporting ? "Preparing…" : "Export as Markdown"}
        </Button>
      </div>

      <HeadlineSummarySection />
      <SkillsSection cv={cv} onChange={() => void load()} />
      <VerifiedWorkSection cv={cv} />
      <ExperienceSection cv={cv} />
      <EducationSection cv={cv} onChange={() => void load()} />
      <CertificationsSection cv={cv} onChange={() => void load()} />
    </div>
  );
}
