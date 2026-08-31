import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import { create, destroy, index, update } from "./hierarchy.controller.js";
import {
  assign,
  end,
  indexOccupancy,
  memberHistory,
  positionHistory,
  replace,
  showOccupancy,
} from "./occupancy.controller.js";

const router = Router();

// Every route below acts as whoever the bearer token says it is. No handler
// reads an actor id out of the body or the params.
router.use(requireAuth);

// The whole tree for one organisation.
router.get("/:organisationId", index);

router.post("/:organisationId/positions", create);
router.patch("/:organisationId/positions/:positionId", update);
router.delete("/:organisationId/positions/:positionId", destroy);

// Occupancy — who occupies which position. See occupancy.service.ts: a
// position never carries an occupant field, so all of this is its own
// sub-resource under a position, plus one organisation-wide list.
router.get("/:organisationId/occupancy", indexOccupancy);
router.get(
  "/:organisationId/positions/:positionId/occupant",
  showOccupancy,
);
router.post("/:organisationId/positions/:positionId/occupant", assign);
router.put("/:organisationId/positions/:positionId/occupant", replace);
router.delete("/:organisationId/positions/:positionId/occupant", end);
router.get(
  "/:organisationId/positions/:positionId/occupancy-history",
  positionHistory,
);
router.get(
  "/:organisationId/members/:memberId/occupancy-history",
  memberHistory,
);

export default router;
