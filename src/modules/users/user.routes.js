import { Router } from "express";
import verifyJWT from "../../middleware/verifyJWT.js";
import verifyAdmin from "../../middleware/verifyAdmin.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { getDashboard, getMe, getUsers, updateMe } from "./user.controller.js";

const router = Router();
router.get("/me", verifyJWT, asyncHandler(getMe));
router.get("/me/dashboard", verifyJWT, asyncHandler(getDashboard));
router.patch("/me", verifyJWT, asyncHandler(updateMe));
router.get("/", verifyJWT, verifyAdmin, asyncHandler(getUsers));
export default router;
