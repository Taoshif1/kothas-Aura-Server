import { ObjectId } from "mongodb";
import { getDatabase } from "../../config/mongodb.js";

const publicProfile = ({ _id, email, name, phone, photoURL, role, isBlocked, addresses, createdAt, updatedAt }) => ({ _id, email, name, phone, photoURL, role, isBlocked, addresses: addresses || [], createdAt, updatedAt });
const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const objectId = (value) => { if (!ObjectId.isValid(value)) throw Object.assign(new Error("Invalid customer id"), { status: 400 }); return new ObjectId(value); };

export const getMe = async (req, res) => res.json({ user: publicProfile(req.currentUser) });
export const getDashboard = async (req, res) => {
  const orderCollection = getDatabase().collection("orders");
  const [summary, recentOrders] = await Promise.all([
    orderCollection.aggregate([{ $match: { userId: req.auth.userId } }, { $group: { _id: null, totalOrders: { $sum: 1 }, pendingOrders: { $sum: { $cond: [{ $in: ["$orderStatus", ["Pending", "Confirmed", "Processing"]] }, 1, 0] } }, deliveredOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", "Delivered"] }, 1, 0] } }, totalSpend: { $sum: { $cond: [{ $eq: ["$orderStatus", "Delivered"] }, "$total", 0] } } } }]).next(),
    orderCollection.find({ userId: req.auth.userId }).sort({ createdAt: -1 }).limit(5).toArray(),
  ]);
  res.json({ summary: { totalOrders: summary?.totalOrders || 0, pendingOrders: summary?.pendingOrders || 0, deliveredOrders: summary?.deliveredOrders || 0, totalSpend: summary?.totalSpend || 0, savedAddresses: req.currentUser.addresses?.length || 0 }, recentOrders });
};
export const updateMe = async (req, res) => {
  const changes = {};
  if (Object.hasOwn(req.body, "name")) { const name = String(req.body.name || "").trim(); if (name.length < 2 || name.length > 80) throw Object.assign(new Error("Name must be 2 to 80 characters"), { status: 400 }); changes.name = name; }
  if (Object.hasOwn(req.body, "phone")) { const phone = String(req.body.phone || "").replace(/[\s-]/g, ""); if (phone && !/^01\d{9}$/.test(phone)) throw Object.assign(new Error("Use a valid Bangladesh phone number"), { status: 400 }); changes.phone = phone; }
  if (Object.hasOwn(req.body, "photoURL")) { const photoURL = String(req.body.photoURL || "").trim(); if (photoURL) { try { const url = new URL(photoURL); if (!["http:", "https:"].includes(url.protocol)) throw new Error(); } catch { throw Object.assign(new Error("Photo URL must be a valid http or https URL"), { status: 400 }); } } changes.photoURL = photoURL; }
  if (!Object.keys(changes).length) throw Object.assign(new Error("No editable profile fields provided"), { status: 400 });
  const user = await getDatabase().collection("users").findOneAndUpdate({ _id: req.auth.userId }, { $set: { ...changes, updatedAt: new Date() } }, { returnDocument: "after" });
  res.json({ user: publicProfile(user) });
};

export const getUsers = async (req, res) => {
  const users = await getDatabase().collection("users").find({}, { projection: { firebaseUid: 0 } }).sort({ createdAt: -1 }).toArray();
  res.json({ users, count: users.length });
};

export const listCustomers = async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1); const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const filter = { role: { $ne: "admin" } };
  if (req.query.status === "active") filter.isBlocked = { $ne: true }; else if (req.query.status === "blocked") filter.isBlocked = true;
  if (req.query.search?.trim()) { const q = { $regex: escapeRegex(req.query.search.trim()), $options: "i" }; filter.$or = [{ name: q }, { email: q }, { phone: q }]; }
  const users = getDatabase().collection("users"); const orders = getDatabase().collection("orders");
  const [items, count] = await Promise.all([users.find(filter, { projection: { firebaseUid: 0 } }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(), users.countDocuments(filter)]);
  const summaries = await orders.aggregate([{ $match: { userId: { $in: items.map((item) => item._id) } } }, { $group: { _id: "$userId", totalOrders: { $sum: 1 }, deliveredOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", "Delivered"] }, 1, 0] } }, totalSpend: { $sum: { $cond: [{ $eq: ["$orderStatus", "Delivered"] }, "$total", 0] } }, lastOrderAt: { $max: "$createdAt" } } }]).toArray();
  const byId = new Map(summaries.map((item) => [String(item._id), item]));
  res.json({ customers: items.map((item) => ({ ...publicProfile(item), ...(byId.get(String(item._id)) || { totalOrders: 0, deliveredOrders: 0, totalSpend: 0, lastOrderAt: null }) })), count, page, limit, totalPages: Math.ceil(count / limit) });
};

export const getCustomer = async (req, res) => {
  const _id = objectId(req.params.id); const user = await getDatabase().collection("users").findOne({ _id, role: { $ne: "admin" } });
  if (!user) throw Object.assign(new Error("Customer not found"), { status: 404 });
  const recentOrders = await getDatabase().collection("orders").find({ userId: _id }).sort({ createdAt: -1 }).limit(10).toArray();
  const delivered = recentOrders.filter((order) => order.orderStatus === "Delivered");
  const allSummary = await getDatabase().collection("orders").aggregate([{ $match: { userId: _id } }, { $group: { _id: null, totalOrders: { $sum: 1 }, deliveredOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", "Delivered"] }, 1, 0] } }, totalSpend: { $sum: { $cond: [{ $eq: ["$orderStatus", "Delivered"] }, "$total", 0] } }, lastOrderAt: { $max: "$createdAt" } } }]).next();
  res.json({ customer: publicProfile(user), summary: allSummary || { totalOrders: 0, deliveredOrders: delivered.length, totalSpend: 0, lastOrderAt: null }, recentOrders });
};

export const updateCustomerStatus = async (req, res) => {
  if (typeof req.body.isBlocked !== "boolean") throw Object.assign(new Error("isBlocked must be boolean"), { status: 400 });
  const customer = await getDatabase().collection("users").findOneAndUpdate({ _id: objectId(req.params.id), role: { $ne: "admin" } }, { $set: { isBlocked: req.body.isBlocked, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!customer) throw Object.assign(new Error("Customer not found or protected admin account"), { status: 404 });
  res.json({ customer: publicProfile(customer) });
};
