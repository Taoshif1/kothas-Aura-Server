import jwt from "jsonwebtoken";
import { getDatabase } from "../config/mongodb.js";

const verifyJWT = async (req, res, next) => {
  try {
    const token = req.cookies?.kotha_session;
    if (!token) return res.status(401).json({ message: "Authentication required" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await getDatabase().collection("users").findOne({ firebaseUid: payload.sub });
    if (!user || user.isBlocked) return res.status(403).json({ message: user?.isBlocked ? "Account is blocked" : "User account not found" });
    req.auth = { firebaseUid: user.firebaseUid, userId: user._id, role: user.role };
    req.currentUser = user;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
};

export default verifyJWT;
