import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  create,
  createContractHandler,
  indexContracts,
  showForMember,
  update,
  updateContractHandler,
  indexExpiring,
  scanExpiry,
  createReviewWork,
} from "./employment.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

router.get("/:organisationId/expiring-contracts", indexExpiring);
router.post("/:organisationId/scan-expiry", scanExpiry);
router.post("/:organisationId/contracts/:contractId/review-work", createReviewWork);

// The entry point is always through a member — Yahzel has no organisation-wide
// employment browse; see people-panel.tsx, which opens this from a person's
// own row. Mirrors occupancy's own member-scoped GET.
router.get("/:organisationId/members/:memberId", showForMember);
router.post("/:organisationId/members/:memberId", create);

router.patch("/:organisationId/:employmentId", update);

router.get("/:organisationId/:employmentId/contracts", indexContracts);
router.post("/:organisationId/:employmentId/contracts", createContractHandler);
router.patch(
  "/:organisationId/:employmentId/contracts/:contractId",
  updateContractHandler,
);

export default router;
