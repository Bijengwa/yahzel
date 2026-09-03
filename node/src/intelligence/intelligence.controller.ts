import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import { OrganisationError } from "../organisation/organisation.service.js";
import { getOrganisationOverview } from "./intelligence.overview.service.js";
import {
  IntelligenceError,
  getAttention,
  resolveAttentionSignal,
  runAttentionScan,
} from "./intelligence.signal.service.js";
import { getOrganisationActivity } from "./intelligence.activity.service.js";
import { searchOrganisation } from "./intelligence.search.service.js";
import { getMemberOperationalHistory } from "./intelligence.history.service.js";

function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof IntelligenceError || error instanceof OrganisationError) {
    res.status(error.status).json({ message: error.message, errors: error.errors });
    return;
  }

  console.error(`${context}:`, error);
  res.status(500).json({ message: "Something went wrong. Please try again.", errors: [] });
}

function readId(raw: unknown, label: string): number {
  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw IntelligenceError.field(404, "form", `That ${label} could not be found.`);
  }

  return value;
}

export async function overview(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    res.status(200).json(await getOrganisationOverview(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to load overview");
  }
}

export async function attentionIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    res.status(200).json(await getAttention(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to load attention");
  }
}

export async function attentionScan(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    res.status(200).json(await runAttentionScan(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to run attention scan");
  }
}

export async function attentionResolve(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const signalId = readId(req.params.signalId, "attention item");
    res
      .status(200)
      .json(await resolveAttentionSignal(currentUserId(req), organisationId, signalId));
  } catch (error) {
    handleFailure(res, error, "Failed to resolve attention item");
  }
}

export async function activityIndex(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    res.status(200).json(await getOrganisationActivity(currentUserId(req), organisationId));
  } catch (error) {
    handleFailure(res, error, "Failed to load activity");
  }
}

export async function search(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    res
      .status(200)
      .json(await searchOrganisation(currentUserId(req), organisationId, req.query.q));
  } catch (error) {
    handleFailure(res, error, "Failed to search");
  }
}

export async function memberHistory(req: Request, res: Response): Promise<void> {
  try {
    const organisationId = readId(req.params.organisationId, "organisation");
    const memberId = readId(req.params.memberId, "member");
    res
      .status(200)
      .json(await getMemberOperationalHistory(currentUserId(req), organisationId, memberId));
  } catch (error) {
    handleFailure(res, error, "Failed to load member history");
  }
}
