import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  applicationsCreate,
  applicationsReview,
  applicationsShow,
  applicationsWithdraw,
  interviewsCreate,
  interviewsUpdate,
  myApplicationsIndex,
  offersAccept,
  offersCreate,
  offersDecline,
  offersWithdraw,
  organisationApplicationsIndex,
  postingApplicationsIndex,
  postingsCreate,
  postingsIndex,
  postingsShow,
  postingsUpdateStatus,
} from "./hiring.controller.js";

const router = Router();

// Every route acts as whoever the bearer token says it is. No handler reads
// an actor id out of the body or the params.
router.use(requireAuth);

// The signed-in person's own applications, across every organisation —
// listed first so it never collides with an :organisationId param.
router.get("/applications/mine", myApplicationsIndex);
router.post("/applications/:applicationId/withdraw", applicationsWithdraw);
router.post("/offers/:offerId/accept", offersAccept);
router.post("/offers/:offerId/decline", offersDecline);

router.get("/:organisationId/postings", postingsIndex);
router.post("/:organisationId/postings", postingsCreate);
router.get("/:organisationId/postings/:postingId", postingsShow);
router.post("/:organisationId/postings/:postingId/status", postingsUpdateStatus);

router.post("/:organisationId/postings/:postingId/applications", applicationsCreate);
router.get("/:organisationId/postings/:postingId/applications", postingApplicationsIndex);

router.get("/:organisationId/applications", organisationApplicationsIndex);
router.get("/:organisationId/applications/:applicationId", applicationsShow);
router.post("/:organisationId/applications/:applicationId/review", applicationsReview);

router.post("/:organisationId/applications/:applicationId/interviews", interviewsCreate);
router.patch("/:organisationId/interviews/:interviewId", interviewsUpdate);

router.post("/:organisationId/applications/:applicationId/offers", offersCreate);
router.post("/:organisationId/offers/:offerId/withdraw", offersWithdraw);

export default router;
