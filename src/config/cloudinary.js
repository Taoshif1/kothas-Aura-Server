import { v2 as cloudinary } from "cloudinary";

let configured = false;

const getCloudinary = () => {
  if (!configured) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw Object.assign(new Error("Image upload service is not configured"), { status: 503 });
    }
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
};

export const uploadProductImage = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = getCloudinary().uploader.upload_stream(
      { folder: "kothas-aura/products", resource_type: "image" },
      (error, result) => {
        if (error) return reject(error);
        return resolve({ url: result.secure_url });
      },
    );
    stream.end(buffer);
  });
