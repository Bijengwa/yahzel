import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import { create, destroy, index, update } from "./hierarchy.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

// The whole tree for one organisation.
router.get("/:organisationId", index);

router.post("/:organisationId/positions", create);
router.patch("/:organisationId/positions/:positionId", update);
router.delete("/:organisationId/positions/:positionId", destroy);

export default router;
