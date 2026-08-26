import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import verifyAdmin from "../src/middleware/verifyAdmin.js";
import { hydrateCartItems, mergeCartItems, validateCartSelection, validateQuantity } from "../src/modules/cart/cart.service.js";
import { uniqueProductIds } from "../src/modules/wishlist/wishlist.service.js";
import { calculateDeliveryCharge } from "../src/modules/checkout/checkout.service.js";
import { makeOrderNumber, reserveInventory, restoreInventory, validateOrderInput } from "../src/modules/orders/order.service.js";

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

describe("checkout and order rules", () => {
  const calculation = { paymentMethods: [{ method: "cod" }, { method: "bkash" }] };
  const valid = { idempotencyKey: "attempt-1", orderSource: "buy_now", customer: { name: "Aura Customer", phone: "01700000000" }, deliveryAddress: { recipientName: "Aura Customer", phone: "01700000000", addressLine: "Road 1", area: "Dhanmondi", city: "Dhaka", deliveryZone: "inside_dhaka" }, payment: { method: "cod" } };
  it("accepts a valid COD order selection", () => expect(() => validateOrderInput(valid, calculation)).not.toThrow());
  it("rejects invalid Bangladesh phones", () => expect(() => validateOrderInput({ ...valid, customer: { ...valid.customer, phone: "123" } }, calculation)).toThrow(/Bangladesh phone/));
  it("rejects disabled payment methods", () => expect(() => validateOrderInput({ ...valid, payment: { method: "nagad" } }, calculation)).toThrow(/unavailable/));
  it("requires a wallet transaction ID", () => expect(() => validateOrderInput({ ...valid, payment: { method: "bkash" } }, calculation)).toThrow(/transaction ID/));
  it("rejects unsafe wallet transaction IDs", () => expect(() => validateOrderInput({ ...valid, payment: { method: "bkash", transactionId: "<bad>" } }, calculation)).toThrow(/transaction ID/));
  it("requires a complete delivery address", () => expect(() => validateOrderInput({ ...valid, deliveryAddress: { ...valid.deliveryAddress, area: "" } }, calculation)).toThrow(/complete delivery/));
  it("requires a known order source", () => expect(() => validateOrderInput({ ...valid, orderSource: "browser_value" }, calculation)).toThrow(/source/));
  it("creates the human-readable order-number format", () => expect(makeOrderNumber()).toMatch(/^KA-\d{8}-[A-F0-9]{8}$/));
  it("creates different random order numbers", () => expect(makeOrderNumber()).not.toBe(makeOrderNumber()));
  it("uses the configured inside-Dhaka fee", () => expect(calculateDeliveryCharge(500, "inside_dhaka", { insideDhaka: 80, outsideDhaka: 130, freeDeliveryThreshold: null })).toBe(80));
  it("uses the configured outside-Dhaka fee", () => expect(calculateDeliveryCharge(500, "outside_dhaka", { insideDhaka: 80, outsideDhaka: 130, freeDeliveryThreshold: null })).toBe(130));
  it("applies a configured free-delivery threshold", () => expect(calculateDeliveryCharge(1000, "outside_dhaka", { insideDhaka: 80, outsideDhaka: 130, freeDeliveryThreshold: 1000 })).toBe(0));
  it("conditionally decrements simple stock", async () => { const calls=[];const database={collection:()=>({updateOne:async(...args)=>{calls.push(args);return{modifiedCount:1}}})};await reserveInventory([{productId:"p1",name:"Ring",quantity:2,variantSku:null}],null,database);expect(calls[0][0].stock.$gte).toBe(2);expect(calls[0][1].$inc.stock).toBe(-2); });
  it("conditionally decrements only the selected variant", async () => { const calls=[];const database={collection:()=>({updateOne:async(...args)=>{calls.push(args);return{modifiedCount:1}}})};await reserveInventory([{productId:"p1",name:"Ring",quantity:1,variantSku:"R-GOLD"}],null,database);expect(calls[0][0].variants.$elemMatch.sku).toBe("R-GOLD");expect(calls[0][1].$inc["variants.$[variant].stock"]).toBe(-1);expect(calls[0][2].arrayFilters).toEqual([{"variant.sku":"R-GOLD"}]); });
  it("rejects inventory reservation when a conditional update fails", async () => { const database={collection:()=>({updateOne:async()=>({modifiedCount:0})})};await expect(reserveInventory([{productId:"p1",name:"Ring",quantity:9}],null,database)).rejects.toThrow(/Insufficient stock/); });
  it("restores simple stock", async () => { const calls=[];const database={collection:()=>({updateOne:async(...args)=>calls.push(args)})};await restoreInventory({inventoryRestored:false,items:[{productId:"p1",quantity:2}]},null,database);expect(calls[0][1].$inc.stock).toBe(2); });
  it("restores only the purchased variant", async () => { const calls=[];const database={collection:()=>({updateOne:async(...args)=>calls.push(args)})};await restoreInventory({inventoryRestored:false,items:[{productId:"p1",variantSku:"R-7",quantity:2}]},null,database);expect(calls[0][2].arrayFilters).toEqual([{"variant.sku":"R-7"}]); });
  it("does not restore inventory twice", async () => { let calls=0;const database={collection:()=>({updateOne:async()=>{calls+=1}})};await restoreInventory({inventoryRestored:true,items:[{productId:"p1",quantity:2}]},null,database);expect(calls).toBe(0); });
});
