import { Router } from "express";
import asyncHandler from "../../utils/asyncHandler.js";
import { createCategory, deleteCategory, getAdminCategories, getCategories, updateCategory } from "./category.controller.js";
import verifyJWT from "../../middleware/verifyJWT.js";
import verifyAdmin from "../../middleware/verifyAdmin.js";

const router = Router();
router.get("/", asyncHandler(getCategories));
router.get("/admin/all", verifyJWT, verifyAdmin, asyncHandler(getAdminCategories));
router.post("/", verifyJWT, verifyAdmin, asyncHandler(createCategory));
router.patch("/:id", verifyJWT, verifyAdmin, asyncHandler(updateCategory));
router.delete("/:id", verifyJWT, verifyAdmin, asyncHandler(deleteCategory));

export default router;
