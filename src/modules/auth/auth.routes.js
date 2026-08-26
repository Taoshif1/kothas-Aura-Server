import { Router } from "express";
import asyncHandler from "../../utils/asyncHandler.js";
import verifyJWT from "../../middleware/verifyJWT.js";
import { clearSession, createSession, getSessionUser } from "./auth.controller.js";

const router = Router();
router.post("/jwt", asyncHandler(createSession));
router.get("/me", verifyJWT, asyncHandler(getSessionUser));
router.post("/logout", clearSession);
export default router;
