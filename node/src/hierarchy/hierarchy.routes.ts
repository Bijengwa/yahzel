import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  addDepartmentMemberHandler,
  create,
  createDepartmentHandler,
  destroy,
  destroyDepartmentHandler,
  index,
  removeDepartmentMemberHandler,
  showDepartmentHandler,
  update,
  updateDepartmentHandler,
} from "./hierarchy.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

// The whole tree for one organisation.
router.get("/:organisationId", index);

router.post("/:organisationId/positions", create);
router.patch("/:organisationId/positions/:positionId", update);
router.delete("/:organisationId/positions/:positionId", destroy);

router.post("/:organisationId/departments", createDepartmentHandler);
router.get("/:organisationId/departments/:departmentId", showDepartmentHandler);
router.patch(
  "/:organisationId/departments/:departmentId",
  updateDepartmentHandler,
);
router.delete(
  "/:organisationId/departments/:departmentId",
  destroyDepartmentHandler,
);
router.post(
  "/:organisationId/departments/:departmentId/members",
  addDepartmentMemberHandler,
);
router.delete(
  "/:organisationId/departments/:departmentId/members/:memberId",
  removeDepartmentMemberHandler,
);

export default router;
