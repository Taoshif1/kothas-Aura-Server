import { Router } from "express";
import multer from "multer";
import verifyJWT from "../../middleware/verifyJWT.js";
import verifyAdmin from "../../middleware/verifyAdmin.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { uploadImages } from "./upload.controller.js";

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_UPLOAD = 6;
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: MAX_IMAGES_PER_UPLOAD },
  fileFilter(req, file, callback) {
    if (!acceptedTypes.has(file.mimetype)) {
      return callback(Object.assign(new Error("Only JPEG, PNG, and WebP images are allowed"), { status: 400 }));
    }
    return callback(null, true);
  },
});

const receiveImages = (req, res, next) => {
  upload.array("images", MAX_IMAGES_PER_UPLOAD)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Each image must be 5 MB or smaller"
        : `Upload rejected: ${error.message}`;
      return next(Object.assign(new Error(message), { status: 400 }));
    }
    return next(error);
  });
};

const router = Router();
router.post("/images", verifyJWT, verifyAdmin, receiveImages, asyncHandler(uploadImages));

export default router;
