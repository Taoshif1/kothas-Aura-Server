import jwt from "jsonwebtoken";
import { getFirebaseAdminAuth } from "../../config/firebaseAdmin.js";
import { getDatabase } from "../../config/mongodb.js";

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
});
const publicUser = ({ _id, firebaseUid, email, name, phone, photoURL, role, isBlocked, addresses }) => ({ _id, firebaseUid, email, name, phone, photoURL, role, isBlocked, addresses });

export const createSession = async (req, res) => {
  if (!req.body?.idToken) throw Object.assign(new Error("Firebase ID token is required"), { status: 400 });
  const adminAuth = getFirebaseAdminAuth();
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(req.body.idToken, true);
  } catch {
    throw Object.assign(new Error("Invalid Firebase ID token"), { status: 401 });
  }
  if (!decoded.email) throw Object.assign(new Error("A verified Firebase email is required"), { status: 400 });
  const now = new Date();
  const users = getDatabase().collection("users");
  await users.updateOne(
    { firebaseUid: decoded.uid },
    {
      $set: { email: decoded.email.toLowerCase(), updatedAt: now },
      $setOnInsert: { name: decoded.name || "", photoURL: decoded.picture || "", phone: "", role: "customer", isBlocked: false, addresses: [], createdAt: now },
    },
    { upsert: true },
  );
  const user = await users.findOne({ firebaseUid: decoded.uid });
  if (user.isBlocked) throw Object.assign(new Error("Account is blocked"), { status: 403 });
  const token = jwt.sign({ sub: decoded.uid }, process.env.JWT_SECRET, { expiresIn: "7d", issuer: "kothasaura-api" });
  res.cookie("kotha_session", token, cookieOptions()).json({ user: publicUser(user) });
};

export const getSessionUser = async (req, res) => res.json({ user: publicUser(req.currentUser) });
export const clearSession = async (req, res) => {
  res.clearCookie("kotha_session", { ...cookieOptions(), maxAge: undefined });
  res.json({ message: "Session cleared" });
};
