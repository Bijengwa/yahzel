import { Router } from "express";

import { COUNTRIES } from "./shared/countries.js";

/**
 * Static reference data the web client needs to render pickers. It lives here
 * rather than being copied into the Next.js bundle so the list the browser
 * offers and the list the API validates against can never disagree.
 */
const router = Router();

router.get("/countries", (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.status(200).json({ countries: COUNTRIES });
});

export default router;
