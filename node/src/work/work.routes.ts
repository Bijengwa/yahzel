import { Router, raw } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  addReport,
  approveReport,
  assign,
  attachToReport,
  children,
  create,
  editReport,
  index,
  reports,
  sendBackReport,
  sendReport,
  show,
  update,
} from "./work.controller.js";
import { MAX_ATTACHMENT_BYTES } from "./work.storage.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

router.get("/", index);
router.post("/", create);

router.get("/:id", show);
router.patch("/:id", update);

router.post("/:id/assign", assign);

// Child work (one level deep) and the report history for an item.
router.get("/:id/children", children);
router.get("/:id/reports", reports);
router.post("/:id/reports", addReport);

// A single report's lifecycle. reportId is validated in the controller.
router.patch("/:id/reports/:reportId", editReport);
router.post("/:id/reports/:reportId/submit", sendReport);
router.post("/:id/reports/:reportId/accept", approveReport);
router.post("/:id/reports/:reportId/return", sendBackReport);

// Evidence upload — the raw bytes are the body, like the avatar endpoint. Any
// content type is parsed here; the allowlist is enforced in the service so an
// unsupported type answers 415 rather than being silently dropped.
router.post(
  "/:id/reports/:reportId/attachments",
  raw({ type: () => true, limit: MAX_ATTACHMENT_BYTES }),
  attachToReport,
);

export default router;
