import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  activityIndex,
  attentionIndex,
  attentionResolve,
  attentionScan,
  memberHistory,
  overview,
  search,
} from "./intelligence.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

router.get("/:organisationId/overview", overview);

router.get("/:organisationId/attention", attentionIndex);
router.post("/:organisationId/attention/scan", attentionScan);
router.post("/:organisationId/attention/:signalId/resolve", attentionResolve);

router.get("/:organisationId/activity", activityIndex);
router.get("/:organisationId/search", search);

router.get("/:organisationId/members/:memberId/history", memberHistory);

export default router;
