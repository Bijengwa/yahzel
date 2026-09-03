import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  archive,
  create,
  health,
  history,
  index,
  membersCreate,
  membersDelete,
  membersIndex,
  outcomesCreate,
  outcomesIndex,
  outcomesUpdate,
  report,
  reportExport,
  show,
  unarchive,
  update,
  updateStatus,
  workIndex,
  workLink,
  workUnlink,
} from "./project.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

router.get("/:organisationId", index);
router.post("/:organisationId", create);

router.get("/:organisationId/:projectId", show);
router.patch("/:organisationId/:projectId", update);
router.post("/:organisationId/:projectId/status", updateStatus);
router.post("/:organisationId/:projectId/archive", archive);
router.post("/:organisationId/:projectId/unarchive", unarchive);
router.get("/:organisationId/:projectId/health", health);
router.get("/:organisationId/:projectId/events", history);
router.get("/:organisationId/:projectId/reports", report);
router.post("/:organisationId/:projectId/reports/export", reportExport);

router.get("/:organisationId/:projectId/members", membersIndex);
router.post("/:organisationId/:projectId/members", membersCreate);
router.delete(
  "/:organisationId/:projectId/members/:memberProfileId",
  membersDelete,
);

router.get("/:organisationId/:projectId/outcomes", outcomesIndex);
router.post("/:organisationId/:projectId/outcomes", outcomesCreate);
router.patch(
  "/:organisationId/:projectId/outcomes/:outcomeId",
  outcomesUpdate,
);

router.get("/:organisationId/:projectId/work", workIndex);
// Alias matching the V1 spec's literal endpoint name; same handler as /work.
router.get("/:organisationId/:projectId/work-items", workIndex);
router.post("/:organisationId/:projectId/work/:workItemId/link", workLink);
router.post("/:organisationId/:projectId/work/:workItemId/unlink", workUnlink);

export default router;
