import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import {
  WorkError,
  assignWorkItem,
  createWorkItem,
  getWorkItem,
  listWorkItems,
  updateWorkItem,
} from "./work.service.js";

/**
 * One place where a thrown error becomes a response. Anything that is not a
 * deliberate `WorkError` is logged and answered with a generic message, so
 * database details never reach the browser.
 */
function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof WorkError) {
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
