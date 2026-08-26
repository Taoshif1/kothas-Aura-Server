import { getDatabase } from "../../config/mongodb.js";

export const getUsers = async (req, res) => {
  const users = await getDatabase().collection("users").find({}, { projection: { firebaseUid: 0 } }).sort({ createdAt: -1 }).toArray();
  res.json({ users, count: users.length });
};
