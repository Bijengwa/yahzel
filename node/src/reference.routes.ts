import { Router } from "express";

import { COUNTRIES } from "./shared/countries.js";
import {
  DESIGNATIONS,
  ORGANISATION_CLASSES,
  ORGANISATION_TYPES,
  PARTICIPATION_TYPES,
} from "./organisation/organisation.types.js";

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

/**
 * The whole organisation vocabulary in one response: what an organisation is,
 * how a person takes part, which class they sit in, and which position they
 * hold there. The picker the browser renders and the values this API accepts
 * therefore come from the same list.
 */
router.get("/organisation-types", (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.status(200).json({
    organisationTypes: ORGANISATION_TYPES,
    participationTypes: PARTICIPATION_TYPES,
    organisationClasses: ORGANISATION_CLASSES,
    designations: DESIGNATIONS,
  });
});

export default router;
