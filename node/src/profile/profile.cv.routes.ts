import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  cvExport,
  cvShow,
  portfolioSettingsShow,
  portfolioSettingsUpdate,
  portfolioShow,
} from "./profile.cv.controller.js";

/**
 * Mounted at /api/profiles (plural) — every route here names *somebody's*
 * profile by id, unlike /api/profile (singular), which is always the bearer
 * token's own. A profile's CV/portfolio may be read by people other than its
 * owner (see profile.cv.service.ts canView), so this is its own router.
 */
const router = Router();

router.use(requireAuth);

router.get("/:id/cv", cvShow);
router.post("/:id/cv/export", cvExport);

router.get("/:id/portfolio", portfolioShow);
router.get("/:id/portfolio/settings", portfolioSettingsShow);
router.patch("/:id/portfolio/settings", portfolioSettingsUpdate);

export default router;
