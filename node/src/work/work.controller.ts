import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import { OrganisationError } from "../organisation/organisation.service.js";
import {
  WorkError,
  acceptReport,
  addAttachment,
  assignWorkItem,
  createReport,
  createWorkItem,
  getWorkItem,
  listWorkChildren,
  listWorkItems,
  listWorkReports,
  returnReport,
  submitReport,
  updateReport,
  updateWorkItem,
} from "./work.service.js";
import {
  createCapability,
  getWorkSettings,
  instantiateCapability,
  listCapabilitiesForOrganisation,
  updateCapabilityDetails,
  updateWorkSettingsForOrganisation,
} from "./work.capability.service.js";
import {
  createSchedule,
  generateSchedulesForOrganisation,
  listSchedulesForOrganisation,
} from "./work.schedule.service.js";
import { listStalledForOrganisation, runStalledScan } from "./work.stalled.service.js";

/**
 * One place where a thrown error becomes a response. Anything that is not a
 * deliberate `WorkError` is logged and answered with a generic message, so
 * database details never reach the browser.
 */
function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof WorkError || error instanceof OrganisationError) {
    res.status(error.status).json({
      message: error.message,
      errors: error.errors,
    });
    return;
  }

  console.error(`${context}:`, error);

  res.status(500).json({
    message: "Something went wrong. Please try again.",
    errors: [],
  });
}

/** Route parameters are untrusted text until proven otherwise. */
function readId(raw: unknown): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw WorkError.field(404, "form", "That work item could not be found.");
  }

  return value;
}

function readReportId(raw: unknown): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw WorkError.field(404, "form", "That report could not be found.");
  }

  return value;
}

/**
 * These Phase 4 routes are not nested under an organisation path segment
 * (unlike departments/employment), so the organisation is named explicitly —
 * a query parameter on a read, a body field on a write — and checked the
 * same way every other Work call checks it: by membership, not by trusting
 * the caller.
 */
function readOrganisationId(raw: unknown): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw WorkError.field(422, "organisationId", "Choose an organisation.");
  }

  return value;
}

function readCapabilityId(raw: unknown): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw WorkError.field(404, "form", "That capability could not be found.");
  }

  return value;
}

export async function index(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json(await listWorkItems(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to list work items");
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const result = await createWorkItem(currentUserId(req), req.body ?? {});
    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create a work item");
  }
}

export async function show(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id);
    res.status(200).json(await getWorkItem(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to load a work item");
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id);
    res
      .status(200)
      .json(await updateWorkItem(currentUserId(req), id, req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to update a work item");
  }
}

export async function assign(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id);
    res
      .status(200)
      .json(await assignWorkItem(currentUserId(req), id, req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to assign a work item");
  }
}

/* --------------------------------------------------------------- children */

export async function children(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id);
    res.status(200).json(await listWorkChildren(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to list child work items");
  }
}

/* ---------------------------------------------------------------- reports */

export async function reports(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id);
    res.status(200).json(await listWorkReports(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to list reports");
  }
}

export async function addReport(req: Request, res: Response): Promise<void> {
  try {
    const id = readId(req.params.id);
    res
      .status(201)
      .json(await createReport(currentUserId(req), id, req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to create a report");
  }
}

export async function editReport(req: Request, res: Response): Promise<void> {
  try {
    const reportId = readReportId(req.params.reportId);
    res
      .status(200)
      .json(await updateReport(currentUserId(req), reportId, req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to update a report");
  }
}

export async function sendReport(req: Request, res: Response): Promise<void> {
  try {
    const reportId = readReportId(req.params.reportId);
    res.status(200).json(await submitReport(currentUserId(req), reportId));
  } catch (error) {
    handleFailure(res, error, "Failed to submit a report");
  }
}

export async function approveReport(req: Request, res: Response): Promise<void> {
  try {
    const reportId = readReportId(req.params.reportId);
    res.status(200).json(await acceptReport(currentUserId(req), reportId));
  } catch (error) {
    handleFailure(res, error, "Failed to accept a report");
  }
}

export async function sendBackReport(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const reportId = readReportId(req.params.reportId);
    res
      .status(200)
      .json(await returnReport(currentUserId(req), reportId, req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to return a report");
  }
}

/**
 * The file arrives as the raw request body with its own content type; the file
 * name comes on the `fileName` query string. This mirrors the avatar upload —
 * no multipart parser, no base64 round-trip.
 */
export async function attachToReport(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const reportId = readReportId(req.params.reportId);

    const bytes: unknown = req.body;

    const result = await addAttachment(currentUserId(req), reportId, {
      fileBuffer: Buffer.isBuffer(bytes) ? bytes : Buffer.alloc(0),
      fileName: String(req.query.fileName ?? req.headers["x-file-name"] ?? ""),
      contentType: String(req.headers["content-type"] ?? ""),
    });

    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to attach a file");
  }
}

/* ------------------------------------------------------------------ Phase 4
   Settings, capabilities, schedules and stalled-work diagnostics — all
   organisation-scoped, all admin-only except listing/using a capability
   (see work.capability.service.ts's own notes on why).
   --------------------------------------------------------------------- */

export async function settingsShow(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readOrganisationId(req.query.organisationId);
    res.status(200).json(await getWorkSettings(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to load work settings");
  }
}

export async function settingsUpdate(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readOrganisationId(req.body?.organisationId);
    res
      .status(200)
      .json(
        await updateWorkSettingsForOrganisation(
          currentUserId(req),
          organisationId,
          req.body ?? {},
        ),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to update work settings");
  }
}

export async function capabilitiesIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readOrganisationId(req.query.organisationId);
    res
      .status(200)
      .json(await listCapabilitiesForOrganisation(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to list capabilities");
  }
}

export async function capabilitiesCreate(req: Request, res: Response): Promise<void> {
  try {
    const result = await createCapability(currentUserId(req), req.body ?? {});
    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create a capability");
  }
}

export async function capabilitiesUpdate(req: Request, res: Response): Promise<void> {
  try {
    const id = readCapabilityId(req.params.id);
    res
      .status(200)
      .json(await updateCapabilityDetails(currentUserId(req), id, req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to update a capability");
  }
}

export async function capabilitiesInstantiate(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = readCapabilityId(req.params.id);
    const result = await instantiateCapability(
      currentUserId(req),
      id,
      req.body ?? {},
    );
    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to use a capability");
  }
}

export async function schedulesIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readOrganisationId(req.query.organisationId);
    res
      .status(200)
      .json(await listSchedulesForOrganisation(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to list schedules");
  }
}

export async function schedulesCreate(req: Request, res: Response): Promise<void> {
  try {
    const result = await createSchedule(currentUserId(req), req.body ?? {});
    res.status(201).json(result);
  } catch (error) {
    handleFailure(res, error, "Failed to create a schedule");
  }
}

export async function schedulesGenerate(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readOrganisationId(req.body?.organisationId);
    res
      .status(200)
      .json(
        await generateSchedulesForOrganisation(currentUserId(req), organisationId),
      );
  } catch (error) {
    handleFailure(res, error, "Failed to generate recurring work");
  }
}

export async function stalledIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readOrganisationId(req.query.organisationId);
    res
      .status(200)
      .json(await listStalledForOrganisation(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to list stalled work");
  }
}

export async function stalledScan(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readOrganisationId(req.body?.organisationId);
    res.status(200).json(await runStalledScan(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to scan for stalled work");
  }
}
