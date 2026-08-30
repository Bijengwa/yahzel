import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import { assign, create, index, show, update } from "./work.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

router.get("/", index);
router.post("/", create);

router.get("/:id", show);
router.patch("/:id", update);

router.post("/:id/assign", assign);

export default router;
