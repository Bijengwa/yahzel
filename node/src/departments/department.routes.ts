import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  addMember,
  create,
  destroy,
  index,
  members,
  removeMember,
  update,
} from "./department.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

// Every department for one organisation, with its head and member count.
router.get("/:organisationId", index);

// Department CRUD + head position — STRUCTURE capability.
router.post("/:organisationId", create);
router.patch("/:organisationId/:departmentId", update);
router.delete("/:organisationId/:departmentId", destroy);

// The roster of one department, and placing/removing people — reading uses the
// same standing as the structure GET; adding/removing is OCCUPANCY capability.
router.get("/:organisationId/:departmentId/members", members);
router.post("/:organisationId/:departmentId/members", addMember);
router.delete("/:organisationId/:departmentId/members/:memberId", removeMember);

export default router;
