import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadProductImage = vi.fn();
const findOne = vi.fn();

vi.mock("../src/config/cloudinary.js", () => ({ uploadProductImage }));
vi.mock("../src/config/mongodb.js", () => ({
  getDatabase: () => ({ collection: () => ({ findOne }) }),
}));

const { default: uploadRoutes, MAX_IMAGE_SIZE } = await import("../src/modules/uploads/upload.routes.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");

const app = express();
app.use(cookieParser());
app.use("/api/admin/uploads", uploadRoutes);
app.use(errorHandler);

const session = (role) => {
  findOne.mockResolvedValue({ _id: "user-id", firebaseUid: `${role}-uid`, role });
  return jwt.sign({ sub: `${role}-uid` }, process.env.JWT_SECRET);
};

describe("admin image uploads", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "upload-test-secret";
    findOne.mockReset();
    uploadProductImage.mockReset();
  });

  it("rejects unauthenticated uploads", async () => {
    const response = await request(app).post("/api/admin/uploads/images");
    expect(response.status).toBe(401);
  });

  it("rejects non-admin uploads", async () => {
    const response = await request(app)
      .post("/api/admin/uploads/images")
      .set("Cookie", `kotha_session=${session("customer")}`);
    expect(response.status).toBe(403);
  });

  it("rejects unsupported image types", async () => {
    const response = await request(app)
      .post("/api/admin/uploads/images")
      .set("Cookie", `kotha_session=${session("admin")}`)
      .attach("images", Buffer.from("not an image"), { filename: "image.gif", contentType: "image/gif" });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/JPEG, PNG, and WebP/);
  });

  it("rejects images larger than 5 MB", async () => {
    const response = await request(app)
      .post("/api/admin/uploads/images")
      .set("Cookie", `kotha_session=${session("admin")}`)
      .attach("images", Buffer.alloc(MAX_IMAGE_SIZE + 1), { filename: "large.jpg", contentType: "image/jpeg" });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/5 MB/);
  });

  it("returns secure URLs from the image provider", async () => {
    uploadProductImage.mockResolvedValue({ url: "https://res.cloudinary.com/demo/image/upload/product.jpg" });
    const response = await request(app)
      .post("/api/admin/uploads/images")
      .set("Cookie", `kotha_session=${session("admin")}`)
      .attach("images", Buffer.from("image"), { filename: "product.jpg", contentType: "image/jpeg" });
    expect(response.status).toBe(201);
    expect(response.body.images).toEqual([{ url: "https://res.cloudinary.com/demo/image/upload/product.jpg" }]);
    expect(uploadProductImage).toHaveBeenCalledOnce();
  });
});
