import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  create,
  createContractHandler,
  indexContracts,
  showForMember,
  update,
  updateContractHandler,
} from "./employment.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

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
