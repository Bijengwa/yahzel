import { Router } from "express";

import { requireAuth } from "../middleware/require-auth.js";
import {
  login,
  register,
  resendVerification,
  updatePassword,
  verify,
} from "./auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify", verify);
router.post("/verify/resend", resendVerification);

// Signed-in only: changing a password is a Settings action, not a login step.
router.post("/password", requireAuth, updatePassword);

export default router;