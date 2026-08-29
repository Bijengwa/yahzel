import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  accept,
  create,
  decline,
  index,
  invite,
  people,
  remove,
  show,
} from "./organisation.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

// My participation, and registering a new organisation.
router.get("/", index);
router.post("/", create);

router.get("/:id", show);

// People. Membership is an organisation-level responsibility — nothing else
// in Yahzel adds a person to an organisation.
router.get("/:id/members", people);
router.post("/:id/members", invite);
router.delete("/:id/members/:memberId", remove);

// Answering an invitation.
router.post("/:id/membership/accept", accept);
router.post("/:id/membership/decline", decline);

export default router;
