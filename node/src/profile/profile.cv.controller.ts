import type { Request, Response } from "express";

import { currentUserId } from "../middleware/require-auth.js";
import {
  CvError,
  addCertification,
  addEducation,
  addSkill,
  exportCv,
  getCv,
  getPortfolio,
  getPortfolioSettings,
  listMyCertifications,
  listMyEducation,
  listMySkills,
  removeCertification,
  removeEducation,
  removeSkill,
  updateCertificationEntry,
  updateEducationEntry,
  updatePortfolioSettingsForOwner,
} from "./profile.cv.service.js";

function handleFailure(res: Response, error: unknown, context: string): void {
  if (error instanceof CvError) {
    res.status(error.status).json({ message: error.message, errors: error.errors });
    return;
  }

  console.error(`${context}:`, error);

  res.status(500).json({ message: "Something went wrong. Please try again.", errors: [] });
}

function parseId(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/* ------------------------------------------------------------------------
   Skills
   --------------------------------------------------------------------- */

export async function skillsIndex(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json(await listMySkills(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to list skills");
  }
}

export async function skillsCreate(req: Request, res: Response): Promise<void> {
  try {
    res.status(201).json(await addSkill(currentUserId(req), req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to add skill");
  }
}

export async function skillsDestroy(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);

    if (id === null) {
      res.status(404).json({ message: "That skill could not be found.", errors: [] });
      return;
    }

    res.status(200).json(await removeSkill(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to remove skill");
  }
}

/* ------------------------------------------------------------------------
   Education
   --------------------------------------------------------------------- */

export async function educationIndex(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json(await listMyEducation(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to list education");
  }
}

export async function educationCreate(req: Request, res: Response): Promise<void> {
  try {
    res.status(201).json(await addEducation(currentUserId(req), req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to add education");
  }
}

export async function educationUpdate(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);

    if (id === null) {
      res.status(404).json({ message: "That education entry could not be found.", errors: [] });
      return;
    }

    res.status(200).json(await updateEducationEntry(currentUserId(req), id, req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to update education");
  }
}

export async function educationDestroy(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);

    if (id === null) {
      res.status(404).json({ message: "That education entry could not be found.", errors: [] });
      return;
    }

    res.status(200).json(await removeEducation(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to remove education");
  }
}

/* ------------------------------------------------------------------------
   Certifications
   --------------------------------------------------------------------- */

export async function certificationsIndex(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json(await listMyCertifications(currentUserId(req)));
  } catch (error) {
    handleFailure(res, error, "Failed to list certifications");
  }
}

export async function certificationsCreate(req: Request, res: Response): Promise<void> {
  try {
    res.status(201).json(await addCertification(currentUserId(req), req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to add certification");
  }
}

export async function certificationsUpdate(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);

    if (id === null) {
      res.status(404).json({ message: "That certification could not be found.", errors: [] });
      return;
    }

    res
      .status(200)
      .json(await updateCertificationEntry(currentUserId(req), id, req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to update certification");
  }
}

export async function certificationsDestroy(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params.id);

    if (id === null) {
      res.status(404).json({ message: "That certification could not be found.", errors: [] });
      return;
    }

    res.status(200).json(await removeCertification(currentUserId(req), id));
  } catch (error) {
    handleFailure(res, error, "Failed to remove certification");
  }
}

/* ------------------------------------------------------------------------
   CV / Portfolio — by profile id
   --------------------------------------------------------------------- */

function requireProfileIdParam(req: Request, res: Response): number | null {
  const id = parseId(req.params.id);

  if (id === null) {
    res.status(404).json({ message: "That person could not be found.", errors: [] });
    return null;
  }

  return id;
}

export async function cvShow(req: Request, res: Response): Promise<void> {
  try {
    const profileId = requireProfileIdParam(req, res);
    if (profileId === null) return;

    res.status(200).json(await getCv(currentUserId(req), profileId));
  } catch (error) {
    handleFailure(res, error, "Failed to load CV");
  }
}

export async function cvExport(req: Request, res: Response): Promise<void> {
  try {
    const profileId = requireProfileIdParam(req, res);
    if (profileId === null) return;

    res
      .status(200)
      .json(await exportCv(currentUserId(req), profileId, req.body?.format));
  } catch (error) {
    handleFailure(res, error, "Failed to export CV");
  }
}

export async function portfolioShow(req: Request, res: Response): Promise<void> {
  try {
    const profileId = requireProfileIdParam(req, res);
    if (profileId === null) return;

    res.status(200).json(await getPortfolio(currentUserId(req), profileId));
  } catch (error) {
    handleFailure(res, error, "Failed to load portfolio");
  }
}

export async function portfolioSettingsShow(req: Request, res: Response): Promise<void> {
  try {
    const profileId = requireProfileIdParam(req, res);
    if (profileId === null) return;

    const userId = currentUserId(req);

    if (userId !== profileId) {
      res.status(403).json({ message: "You can only view your own portfolio settings.", errors: [] });
      return;
    }

    res.status(200).json(await getPortfolioSettings(userId));
  } catch (error) {
    handleFailure(res, error, "Failed to load portfolio settings");
  }
}

export async function portfolioSettingsUpdate(req: Request, res: Response): Promise<void> {
  try {
    const profileId = requireProfileIdParam(req, res);
    if (profileId === null) return;

    const userId = currentUserId(req);

    if (userId !== profileId) {
      res.status(403).json({ message: "You can only edit your own portfolio settings.", errors: [] });
      return;
    }

    res.status(200).json(await updatePortfolioSettingsForOwner(userId, req.body ?? {}));
  } catch (error) {
    handleFailure(res, error, "Failed to update portfolio settings");
  }
}
