import { Router } from "express";

import { COUNTRIES } from "./shared/countries.js";
import {
  DESIGNATIONS,
  ORGANISATION_CLASSES,
  ORGANISATION_TYPES,
  PARTICIPATION_TYPES,
} from "./organisation/organisation.types.js";
import { CONTRACT_TYPES, EMPLOYMENT_STATUSES } from "./employment/employment.types.js";
import {
  BLOCKED_REASONS,
  BLOCKED_REASON_LABELS,
  BUILT_IN_CAPABILITIES,
  CADENCES,
} from "./work/obligation.types.js";
import {
  PROJECT_OUTCOME_STATUSES,
  PROJECT_STATUSES,
} from "./projects/project.record.js";

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

/**
 * The employment vocabulary: contract types, plus the employment statuses
 * (deliberately the same three organisation_members already uses — see
 * employment.types.ts).
 */
router.get("/employment-types", (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.status(200).json({
    contractTypes: CONTRACT_TYPES,
    employmentStatuses: EMPLOYMENT_STATUSES,
  });
});

/**
 * Phase 4's own vocabulary: the blocked-reason list Work validates against,
 * the cadences a schedule may run on, and the built-in capability catalogue
 * (for a "what could this create?" preview before instantiating one).
 */
router.get("/work-vocabulary", (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.status(200).json({
    blockedReasons: BLOCKED_REASONS.map((value) => ({
      value,
      label: BLOCKED_REASON_LABELS[value],
    })),
    cadences: CADENCES,
    builtInCapabilities: BUILT_IN_CAPABILITIES,
  });
});

/** Phase 5's own vocabulary: project and outcome status. */
router.get("/project-vocabulary", (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.status(200).json({
    projectStatuses: PROJECT_STATUSES,
    outcomeStatuses: PROJECT_OUTCOME_STATUSES,
  });
});

export default router;
