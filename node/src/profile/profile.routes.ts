import { Router, raw } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  abandonEmailChange,
  confirmEmailChange,
  confirmPhone,
  removePicture,
  requestPhoneCode,
  show,
  startEmailChange,
  update,
  uploadPicture,
} from "./profile.controller.js";
import {
  certificationsCreate,
  certificationsDestroy,
  certificationsIndex,
  certificationsUpdate,
  educationCreate,
  educationDestroy,
  educationIndex,
  educationUpdate,
  skillsCreate,
  skillsDestroy,
  skillsIndex,
} from "./profile.cv.controller.js";
import { ACCEPTED_MIME_TYPES, MAX_AVATAR_BYTES } from "./profile.storage.js";

const router = Router();

// Every route below belongs to whoever the bearer token says it belongs to.
router.use(requireAuth);

router.get("/", show);
router.patch("/", update);

router.get("/skills", skillsIndex);
router.post("/skills", skillsCreate);
router.delete("/skills/:id", skillsDestroy);

router.get("/education", educationIndex);
router.post("/education", educationCreate);
router.patch("/education/:id", educationUpdate);
router.delete("/education/:id", educationDestroy);

router.get("/certifications", certificationsIndex);
router.post("/certifications", certificationsCreate);
router.patch("/certifications/:id", certificationsUpdate);
router.delete("/certifications/:id", certificationsDestroy);

router.post("/email/change", startEmailChange);
router.post("/email/verify", confirmEmailChange);
router.post("/email/cancel", abandonEmailChange);

router.post("/phone/send-code", requestPhoneCode);
router.post("/phone/verify", confirmPhone);

router.post(
  "/picture",
  raw({ type: ACCEPTED_MIME_TYPES, limit: MAX_AVATAR_BYTES }),
  uploadPicture,
);
router.delete("/picture", removePicture);

export default router;
