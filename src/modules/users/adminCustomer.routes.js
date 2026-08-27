import { Router } from "express";
import verifyJWT from "../../middleware/verifyJWT.js";
import verifyAdmin from "../../middleware/verifyAdmin.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { getCustomer, listCustomers, updateCustomerStatus } from "./user.controller.js";

const router = Router();
router.use(verifyJWT, verifyAdmin);
router.get("/", asyncHandler(listCustomers));
router.get("/:id", asyncHandler(getCustomer));
router.patch("/:id/status", asyncHandler(updateCustomerStatus));
export default router;
