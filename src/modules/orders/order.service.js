import { createHash, randomBytes } from "node:crypto";
import client, { getDatabase } from "../../config/mongodb.js";
import { calculateCheckout } from "../checkout/checkout.service.js";
import { normalizePhone } from "../addresses/address.controller.js";

const allowedPayments = new Set(["cod", "bkash", "nagad"]);
export const makeOrderNumber = () => `KA-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
const normalizedText = (value) => String(value || "").trim();
export const normalizeOrderSelections = (selections = []) => selections.map((item) => ({
  productId: String(item.productId || ""),
  variantSku: normalizedText(item.variantSku),
  quantity: Number(item.quantity),
})).sort((a, b) => `${a.productId}:${a.variantSku}`.localeCompare(`${b.productId}:${b.variantSku}`));
export const assertCartSelectionsMatch = (authoritativeSelections, requestSelections) => {
  if (JSON.stringify(normalizeOrderSelections(authoritativeSelections)) !== JSON.stringify(normalizeOrderSelections(requestSelections))) {
    throw Object.assign(new Error("Your cart changed. Refresh checkout and try again."), { status: 409 });
  }
};
export const createIdempotencyFingerprint = (body, { userId = null, selections = [], customerType }) => {
  const material = {
    customerType,
    actor: customerType === "registered" ? String(userId || "") : normalizePhone(body.customer?.phone || ""),
    orderSource: body.orderSource,
    items: normalizeOrderSelections(selections),
    customerName: normalizedText(body.customer?.name),
    customerEmail: normalizedText(body.customer?.email).toLowerCase(),
    customerPhone: normalizePhone(body.customer?.phone || ""),
    deliveryAddress: { recipientName: normalizedText(body.deliveryAddress?.recipientName), phone: normalizePhone(body.deliveryAddress?.phone || ""), addressLine: normalizedText(body.deliveryAddress?.addressLine), area: normalizedText(body.deliveryAddress?.area), city: normalizedText(body.deliveryAddress?.city), postalCode: normalizedText(body.deliveryAddress?.postalCode), deliveryZone: body.deliveryAddress?.deliveryZone || "" },
    payment: { method: body.payment?.method || "", transactionId: normalizedText(body.payment?.transactionId), senderPhone: normalizePhone(body.payment?.senderPhone || "") },
    couponCode: normalizedText(body.couponCode).toUpperCase(),
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
};
const sameActor = (order, { userId, customerType }, body) => order.customerType === customerType && (customerType === "registered" ? Boolean(userId && order.userId && String(order.userId)===String(userId)) : normalizePhone(order.customer?.phone || "") === normalizePhone(body.customer?.phone || ""));
export const resolveIdempotentOrder = (order, context, body, fingerprint) => {
  if (order && sameActor(order, context, body) && order.idempotencyFingerprint && order.idempotencyFingerprint === fingerprint) return order;
  throw Object.assign(new Error("Idempotency key was already used for a different order request"), { status: 409 });
};

export const validateOrderInput = (body, calculation) => {
  if (!body.idempotencyKey?.trim() || body.idempotencyKey.trim().length > 128) throw Object.assign(new Error("A valid idempotency key is required"), { status: 400 });
  if (!["cart", "buy_now"].includes(body.orderSource)) throw Object.assign(new Error("Invalid order source"), { status: 400 });
  if (!body.customer?.name?.trim() || !/^01\d{9}$/.test(normalizePhone(body.customer?.phone))) throw Object.assign(new Error("Valid customer name and Bangladesh phone are required"), { status: 400 });
  const address = body.deliveryAddress;
  if (!address?.recipientName?.trim() || !/^01\d{9}$/.test(normalizePhone(address?.phone)) || !address?.addressLine?.trim() || !address?.area?.trim() || !address?.city?.trim()) throw Object.assign(new Error("A complete delivery address is required"), { status: 400 });
  if (!allowedPayments.has(body.payment?.method) || !calculation.paymentMethods.some((payment) => payment.method === body.payment.method)) throw Object.assign(new Error("Selected payment method is unavailable"), { status: 400 });
  if (body.payment.method !== "cod" && !/^[A-Za-z0-9_-]{5,64}$/.test(body.payment.transactionId?.trim() || "")) throw Object.assign(new Error("Valid transaction ID is required"), { status: 400 });
};

export const reserveInventory = async (items, session, database = getDatabase()) => {
  for (const item of items) {
    let result;
    if (item.variantSku) {
      result = await database.collection("products").updateOne(
        { _id: item.productId, active: { $ne: false }, variants: { $elemMatch: { sku: item.variantSku, active: true, stock: { $gte: item.quantity } } } },
        { $inc: { "variants.$[variant].stock": -item.quantity }, $set: { updatedAt: new Date() } },
        { arrayFilters: [{ "variant.sku": item.variantSku }], session },
      );
    } else {
      result = await database.collection("products").updateOne(
        { _id: item.productId, active: { $ne: false }, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity }, $set: { updatedAt: new Date() } },
        { session },
      );
    }
    if (!result.modifiedCount) throw Object.assign(new Error(`Insufficient stock for ${item.name}`), { status: 409 });
  }
};

const uniqueOrderNumber = async (orders, session) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = makeOrderNumber();
    if (!(await orders.findOne({ orderNumber: candidate }, { session }))) return candidate;
  }
  throw Object.assign(new Error("Could not allocate an order number"), { status: 503 });
};

export const createOrder = async (body, { userId = null, selections, fingerprintSelections = selections, customerType }) => {
  const orders = getDatabase().collection("orders");
  const key=body.idempotencyKey?.trim();if(!key||key.length>128)throw Object.assign(new Error("A valid idempotency key is required"),{status:400});
  const context={userId,customerType},fingerprint=createIdempotencyFingerprint(body,{...context,selections:fingerprintSelections});
  const existing = await orders.findOne({ idempotencyKey: key });
  if (existing) return resolveIdempotentOrder(existing,context,body,fingerprint);
  if(customerType==="registered"&&body.orderSource==="cart")assertCartSelectionsMatch(selections,fingerprintSelections);
  for(let attempt=0;attempt<3;attempt+=1){const session = client.startSession();let order;
  try { await session.withTransaction(async () => {
      const calculation = await calculateCheckout(selections, body.deliveryAddress?.deliveryZone, { session, couponCode: body.couponCode });
      validateOrderInput(body, calculation);
      await reserveInventory(calculation.items, session);
      const now = new Date();
      order = {
        orderNumber: await uniqueOrderNumber(orders, session), idempotencyKey: key, idempotencyFingerprint:fingerprint, customerType, orderSource: body.orderSource, userId,
        customer: { ...body.customer, phone: normalizePhone(body.customer.phone) },
        deliveryAddress: { ...body.deliveryAddress, phone: normalizePhone(body.deliveryAddress.phone) },
        items: calculation.items.map(({ availableStock, ...item }) => item), subtotal: calculation.subtotal, coupon: calculation.coupon, discount: calculation.discount, deliveryCharge: calculation.deliveryCharge, total: calculation.total,
        payment: { method: body.payment.method, status: body.payment.method === "cod" ? "due" : "pending_verification", transactionId: body.payment.transactionId?.trim() || "", senderPhone: normalizePhone(body.payment.senderPhone || ""), verifiedAt: null, verifiedBy: null },
        orderStatus: "Pending", statusHistory: [{ status: "Pending", changedAt: now, changedBy: userId }], inventoryRestored: false, createdAt: now, updatedAt: now,
      };
      await orders.insertOne(order, { session });
      if (calculation.couponDocument) { const used=await getDatabase().collection("coupons").updateOne({_id:calculation.couponDocument._id,...(calculation.couponDocument.usageLimit!=null&&{usedCount:{$lt:calculation.couponDocument.usageLimit}})},{$inc:{usedCount:1},$set:{updatedAt:now}},{session});if(!used.modifiedCount)throw Object.assign(new Error("Coupon usage limit has been reached"),{status:409}); }
      if (userId && body.orderSource === "cart") await getDatabase().collection("carts").updateOne({ userId }, { $set: { items: [], updatedAt: now } }, { session });
    });
    return order;
  } catch (error) {
    if(error?.code===11000&&(error.keyPattern?.idempotencyKey||error.keyValue?.idempotencyKey)){const retry=await orders.findOne({idempotencyKey:key});return resolveIdempotentOrder(retry,context,body,fingerprint);}
    if(error?.code===11000&&(error.keyPattern?.orderNumber||error.keyValue?.orderNumber)){if(attempt<2)continue;throw Object.assign(new Error("Could not allocate an order number"),{status:503});}
    throw error;
  } finally { await session.endSession(); }}
  throw Object.assign(new Error("Could not create order"),{status:503});
};

export const restoreInventory = async (order, session, database = getDatabase()) => {
  if (order.inventoryRestored) return;
  for (const item of order.items) {
    if (item.variantSku) await database.collection("products").updateOne({ _id: item.productId }, { $inc: { "variants.$[variant].stock": item.quantity } }, { arrayFilters: [{ "variant.sku": item.variantSku }], session });
    else await database.collection("products").updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } }, { session });
  }
};
