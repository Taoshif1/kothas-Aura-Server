import { Router } from "express";
import asyncHandler from "../../utils/asyncHandler.js";
import { createProduct, deleteProduct, getAdminProducts, getProductById, getProducts, updateProduct } from "./product.controller.js";
import verifyJWT from "../../middleware/verifyJWT.js";
import verifyAdmin from "../../middleware/verifyAdmin.js";
import { publicList as getProductReviews } from "../reviews/review.controller.js";

const router = Router();
router.get("/", asyncHandler(getProducts));
router.get("/admin/all", verifyJWT, verifyAdmin, asyncHandler(getAdminProducts));
router.get("/:productId/reviews", asyncHandler(getProductReviews));
router.get("/:id", asyncHandler(getProductById));
router.post("/", verifyJWT, verifyAdmin, asyncHandler(createProduct));
router.patch("/:id", verifyJWT, verifyAdmin, asyncHandler(updateProduct));
router.delete("/:id", verifyJWT, verifyAdmin, asyncHandler(deleteProduct));

export default router;
