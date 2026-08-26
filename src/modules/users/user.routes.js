import { Router } from "express";
import verifyJWT from "../../middleware/verifyJWT.js";
import verifyAdmin from "../../middleware/verifyAdmin.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { getUsers } from "./user.controller.js";

const router = Router();
router.get("/", verifyJWT, verifyAdmin, asyncHandler(getUsers));
export default router;
