import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import { create, index, show } from "./project.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

router.get("/:organisationId", index);
router.post("/:organisationId", create);
router.get("/:organisationId/:projectId", show);

export default router;
