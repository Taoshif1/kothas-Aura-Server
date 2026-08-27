import { getDatabase } from "../../config/mongodb.js";

export const normalizeCouponCode = (value) => String(value || "").trim().toUpperCase();
export const validateCouponDocument = (body, { partial = false } = {}) => {
  const code = normalizeCouponCode(body.code); if (!partial && !/^[A-Z0-9_-]{3,32}$/.test(code)) throw Object.assign(new Error("Coupon code must be 3 to 32 letters, numbers, underscores or dashes"), { status: 400 });
  if (body.type !== undefined && !["percentage", "fixed"].includes(body.type)) throw Object.assign(new Error("Invalid coupon type"), { status: 400 });
  if (body.value !== undefined && (!Number.isFinite(Number(body.value)) || Number(body.value) <= 0 || (body.type === "percentage" && Number(body.value) > 100))) throw Object.assign(new Error("Invalid coupon value"), { status: 400 });
  for (const key of ["minimumOrder", "maximumDiscount"]) if (body[key] !== undefined && body[key] !== null && (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0)) throw Object.assign(new Error(`Invalid ${key}`), { status: 400 });
  if (body.usageLimit !== undefined && body.usageLimit !== null && (!Number.isInteger(Number(body.usageLimit)) || Number(body.usageLimit) <= 0)) throw Object.assign(new Error("Usage limit must be a positive integer"), { status: 400 });
  if (body.startsAt && body.expiresAt && new Date(body.expiresAt) <= new Date(body.startsAt)) throw Object.assign(new Error("Coupon expiry must be after its start date"), { status: 400 });
};
export const evaluateCoupon = (coupon, subtotal, now = new Date()) => {
  if (!coupon || coupon.active === false) throw Object.assign(new Error("Coupon is invalid or inactive"), { status: 400 });
  if (coupon.startsAt && new Date(coupon.startsAt) > now) throw Object.assign(new Error("Coupon is not active yet"), { status: 400 });
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) throw Object.assign(new Error("Coupon has expired"), { status: 400 });
  if (coupon.usageLimit !== null && coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) throw Object.assign(new Error("Coupon usage limit has been reached"), { status: 400 });
  if (subtotal < (coupon.minimumOrder || 0)) throw Object.assign(new Error(`Minimum order is ৳ ${coupon.minimumOrder}`), { status: 400 });
  let discount = coupon.type === "percentage" ? subtotal * coupon.value / 100 : coupon.value;
  if (coupon.type === "percentage" && coupon.maximumDiscount !== null && coupon.maximumDiscount !== undefined) discount = Math.min(discount, coupon.maximumDiscount);
  return Math.min(subtotal, Math.round(discount * 100) / 100);
};
export const resolveCoupon = async (code, subtotal, { session } = {}) => {
  const normalized = normalizeCouponCode(code); if (!normalized) return null;
  const coupon = await getDatabase().collection("coupons").findOne({ code: normalized }, { session });
  const discount = evaluateCoupon(coupon, subtotal);
  return { document: coupon, snapshot: { code: coupon.code, type: coupon.type, value: coupon.value, discount }, discount };
};
