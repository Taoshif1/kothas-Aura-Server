import { uploadProductImage } from "../../config/cloudinary.js";

export const uploadImages = async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ message: "Select at least one image" });

  try {
    const images = await Promise.all(req.files.map((file) => uploadProductImage(file.buffer)));
    return res.status(201).json({ images });
  } catch (error) {
    console.error("Cloudinary image upload failed");
    throw Object.assign(new Error("One or more images could not be uploaded"), {
      status: error.status || 502,
    });
  }
};
