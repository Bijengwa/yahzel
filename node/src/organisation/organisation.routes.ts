import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  accept,
  conclude,
  create,
  decline,
  index,
  invitations,
  invite,
  myInvitations,
  people,
  show,
  standing,
  update,
  withdraw,
} from "./organisation.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

// My participation — active, inactive and concluded alike — and registering
// a new organisation.
router.get("/", index);
router.post("/", create);

// The invitations waiting for me. Declared before "/:id" so the literal
// segment is never read as an organisation id.
router.get("/invitations", myInvitations);
router.post("/invitations/:invitationId/accept", accept);
router.post("/invitations/:invitationId/decline", decline);

router.get("/:id", show);
router.patch("/:id", update);

// People. Membership is an organisation-level responsibility — nothing else
// in Yahzel adds a person to an organisation.
router.get("/:id/members", people);

// Class, position, title, participation type and status. This is the one way
// somebody becomes Head or joins the Administration.
router.patch("/:id/members/:memberId", standing);

// Ending a membership concludes it; the row and its timeline are kept.
router.delete("/:id/members/:memberId", conclude);

// Invitations sent by this organisation.
router.get("/:id/invitations", invitations);
router.post("/:id/invitations", invite);
router.delete("/:id/invitations/:invitationId", withdraw);

// Kept from the previous contract: inviting through the People collection.
router.post("/:id/members", invite);

// Answering the invitation waiting for me at one organisation.
router.post("/:id/membership/accept", accept);
router.post("/:id/membership/decline", decline);

export default router;
