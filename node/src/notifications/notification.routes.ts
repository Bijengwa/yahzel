import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import { index, markAllRead, markRead, stream } from "./notification.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is — nobody's
// notifications are readable by naming a different profile id.
router.use(requireAuth);

router.get("/", index);
router.get("/stream", stream);
router.post("/read-all", markAllRead);
router.post("/:id/read", markRead);

export default router;
