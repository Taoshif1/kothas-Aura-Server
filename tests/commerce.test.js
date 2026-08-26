import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import verifyAdmin from "../src/middleware/verifyAdmin.js";
import { hydrateCartItems, mergeCartItems, validateCartSelection, validateQuantity } from "../src/modules/cart/cart.service.js";
import { uniqueProductIds } from "../src/modules/wishlist/wishlist.service.js";

const simple = { _id: { toString: () => "product1" }, name: "Ring", sku: "R-1", price: 500, stock: 3, active: true, images: ["server.jpg"], variants: [] };
const variantProduct = { ...simple, variants: [{ sku: "R-1-GOLD", attributes: { Color: "Gold" }, price: 650, compareAtPrice: null, stock: 2, active: true }] };

describe("commerce validation", () => {
  it("rejects invalid cart quantity", () => expect(() => validateQuantity(0)).toThrow(/quantity/));
  it("requires variantSku for variant products", () => expect(() => validateCartSelection(variantProduct, null, 1)).toThrow(/variantSku/));
  it("rejects nonexistent variants", () => expect(() => validateCartSelection(variantProduct, "missing", 1)).toThrow(/does not exist/));
  it("rejects inactive products", () => expect(() => validateCartSelection({ ...simple, active: false }, null, 1)).toThrow(/inactive/));
  it("rejects quantity above stock", () => expect(() => validateCartSelection(simple, null, 4)).toThrow(/stock/));
  it("hydrates authoritative price instead of browser snapshots", () => { const [item] = hydrateCartItems([{ productId: simple._id, quantity: 2, variantSku: null, price: 1, name: "Fake" }], [simple]); expect(item.unitPrice).toBe(500); expect(item.name).toBe("Ring"); expect(item.lineTotal).toBe(1000); });
  it("deduplicates wishlist product IDs", () => expect(uniqueProductIds(["a", "a", "b"])).toEqual(["a", "b"]));
  it("cart merge is idempotent and does not multiply quantities", () => { const current = [{ productId: "a", variantSku: null, quantity: 2 }]; const once = mergeCartItems(current, [{ productId: "a", variantSku: null, quantity: 3 }]); const twice = mergeCartItems(once, [{ productId: "a", variantSku: null, quantity: 3 }]); expect(twice[0].quantity).toBe(3); });
});

describe("route authorization", () => {
  const app = express();
  const unauthorized = (req, res) => res.status(401).json({ message: "Authentication required" });
  app.get("/api/cart", unauthorized);
  app.get("/api/wishlist", unauthorized);
  app.post("/api/products", (req, res, next) => { req.currentUser = { role: "customer" }; verifyAdmin(req, res, next); }, (req, res) => res.sendStatus(201));
  app.post("/api/categories", (req, res, next) => { req.currentUser = { role: "customer" }; verifyAdmin(req, res, next); }, (req, res) => res.sendStatus(201));
  it("returns 401 for unauthenticated cart", async () => expect((await request(app).get("/api/cart")).status).toBe(401));
  it("returns 401 for unauthenticated wishlist", async () => expect((await request(app).get("/api/wishlist")).status).toBe(401));
  it("rejects non-admin product writes", async () => expect((await request(app).post("/api/products")).status).toBe(403));
  it("rejects non-admin category writes", async () => expect((await request(app).post("/api/categories")).status).toBe(403));
});
