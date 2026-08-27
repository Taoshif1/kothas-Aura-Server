import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import verifyAdmin from "../src/middleware/verifyAdmin.js";
import { hydrateCartItems, mergeCartItems, validateCartSelection, validateQuantity } from "../src/modules/cart/cart.service.js";
import { uniqueProductIds } from "../src/modules/wishlist/wishlist.service.js";
import { calculateDeliveryCharge } from "../src/modules/checkout/checkout.service.js";
import { assertCartSelectionsMatch, createIdempotencyFingerprint, makeOrderNumber, reserveInventory, resolveIdempotentOrder, restoreInventory, validateOrderInput } from "../src/modules/orders/order.service.js";
import { evaluateCoupon, normalizeCouponCode, validateCouponDocument } from "../src/modules/coupons/coupon.service.js";

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

describe("idempotency request fingerprint",()=>{const body={orderSource:"buy_now",customer:{name:"Customer",phone:"01700-000000"},deliveryAddress:{recipientName:"Customer",phone:"01700000000",addressLine:" Road 1 ",area:"Dhanmondi",city:"Dhaka",postalCode:"1209",deliveryZone:"inside_dhaka"},payment:{method:"cod"},couponCode:" aura10 "},items=[{productId:"p1",variantSku:null,quantity:1}];const make=(changes={},context={userId:"u1",customerType:"registered"})=>createIdempotencyFingerprint({...body,...changes},{...context,selections:changes.items||items});
  it("is deterministic for the same normalized request",()=>expect(make()).toBe(make()));
  it("binds registered retries to the authenticated user",()=>expect(make()).not.toBe(make({}, {userId:"u2",customerType:"registered"})));
  it("binds guest retries to normalized phone",()=>expect(make({}, {customerType:"guest"})).not.toBe(make({customer:{...body.customer,phone:"01800000000"}},{customerType:"guest"})));
  it("rejects materially changed item quantities by fingerprint",()=>expect(make()).not.toBe(make({items:[{...items[0],quantity:2}]})));
  it("binds retries to delivery and payment details",()=>{expect(make()).not.toBe(make({deliveryAddress:{...body.deliveryAddress,area:"Gulshan"}}));expect(make()).not.toBe(make({payment:{method:"bkash",transactionId:"TX12345"}}))});
  it("normalizes item order and coupon casing",()=>{const a=createIdempotencyFingerprint({...body,couponCode:"aura10"},{userId:"u1",customerType:"registered",selections:[{productId:"p2",quantity:1},{productId:"p1",quantity:1}]});const b=createIdempotencyFingerprint({...body,couponCode:" AURA10 "},{userId:"u1",customerType:"registered",selections:[{productId:"p1",quantity:1},{productId:"p2",quantity:1}]});expect(a).toBe(b)});
  it("returns an existing order only for the same registered actor and fingerprint",()=>{const fingerprint=make(),order={customerType:"registered",userId:"u1",idempotencyFingerprint:fingerprint};expect(resolveIdempotentOrder(order,{userId:"u1",customerType:"registered"},body,fingerprint)).toBe(order)});
  it("rejects cross-customer registered replay without exposing the order",()=>{const fingerprint=make(),order={customerType:"registered",userId:"u1",idempotencyFingerprint:fingerprint};expect(()=>resolveIdempotentOrder(order,{userId:"u2",customerType:"registered"},body,fingerprint)).toThrow(/different order request/)});
  it("rejects guest replay from a different phone",()=>{const guestBody={...body,customer:{...body.customer,phone:"01700000000"}},fingerprint=createIdempotencyFingerprint(guestBody,{customerType:"guest",selections:items}),order={customerType:"guest",customer:{phone:"01700000000"},idempotencyFingerprint:fingerprint};expect(()=>resolveIdempotentOrder(order,{customerType:"guest"},{...guestBody,customer:{...guestBody.customer,phone:"01800000000"}},fingerprint)).toThrow(/different order request/)});
  it("fails closed for historical orders without a fingerprint",()=>expect(()=>resolveIdempotentOrder({customerType:"registered",userId:"u1"},{userId:"u1",customerType:"registered"},body,make())).toThrow(/different order request/));
  it("preserves a registered cart retry fingerprint after the authoritative cart is cleared",()=>{const request={...body,orderSource:"cart",items},context={userId:"u1",customerType:"registered"};assertCartSelectionsMatch(items,request.items);const fingerprint=createIdempotencyFingerprint(request,{...context,selections:request.items}),order={customerType:"registered",userId:"u1",idempotencyFingerprint:fingerprint};const clearedCart=[];expect(createIdempotencyFingerprint(request,{...context,selections:request.items})).toBe(fingerprint);expect(resolveIdempotentOrder(order,context,request,fingerprint)).toBe(order);expect(clearedCart).toEqual([])});
  it("rejects a new registered cart request when request quantity differs from the server cart",()=>expect(()=>assertCartSelectionsMatch(items,[{...items[0],quantity:2}])).toThrow(/cart changed/i));
  it("includes normalized customer name and email in same-request semantics",()=>{const withEmail={...body,customer:{...body.customer,name:" Customer ",email:"CUSTOMER@EXAMPLE.COM"}},normalized={...body,customer:{...body.customer,name:"Customer",email:"customer@example.com"}};expect(createIdempotencyFingerprint(withEmail,{userId:"u1",customerType:"registered",selections:items})).toBe(createIdempotencyFingerprint(normalized,{userId:"u1",customerType:"registered",selections:items}));expect(createIdempotencyFingerprint(normalized,{userId:"u1",customerType:"registered",selections:items})).not.toBe(createIdempotencyFingerprint({...normalized,customer:{...normalized.customer,email:"other@example.com"}},{userId:"u1",customerType:"registered",selections:items}))});
});

describe("coupon rules",()=>{const base={code:"AURA10",type:"percentage",value:10,minimumOrder:0,maximumDiscount:null,usageLimit:null,usedCount:0,active:true};
  it("normalizes coupon codes to uppercase",()=>expect(normalizeCouponCode(" aura10 ")).toBe("AURA10"));
  it("calculates percentage discounts",()=>expect(evaluateCoupon(base,1000)).toBe(100));
  it("calculates fixed discounts without exceeding subtotal",()=>expect(evaluateCoupon({...base,type:"fixed",value:500},300)).toBe(300));
  it("respects maximum percentage discount",()=>expect(evaluateCoupon({...base,value:50,maximumDiscount:200},1000)).toBe(200));
  it("rejects minimum-order and exhausted coupons",()=>{expect(()=>evaluateCoupon({...base,minimumOrder:1000},500)).toThrow(/Minimum/);expect(()=>evaluateCoupon({...base,usageLimit:2,usedCount:2},1000)).toThrow(/usage limit/)});
  it("rejects upcoming and expired coupons",()=>{const now=new Date("2026-01-10");expect(()=>evaluateCoupon({...base,startsAt:new Date("2026-02-01")},1000,now)).toThrow(/not active/);expect(()=>evaluateCoupon({...base,expiresAt:new Date("2026-01-01")},1000,now)).toThrow(/expired/)});
  it("validates percentage values and date order",()=>{expect(()=>validateCouponDocument({...base,value:101})).toThrow(/value/);expect(()=>validateCouponDocument({...base,startsAt:"2026-02-01",expiresAt:"2026-01-01"})).toThrow(/after/)});
});
