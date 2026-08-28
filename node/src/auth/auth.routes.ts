import { Router } from "express";

import {
  login,
  register,
  resendVerification,
  verify,
} from "./auth.controller.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify", verify);
router.post("/verify/resend", resendVerification);

export default router;