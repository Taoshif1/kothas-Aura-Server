import { getAllowedOrigins } from "../config/environment.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const validateOrigin = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get("origin");
  if (!origin || !getAllowedOrigins().includes(origin)) return res.status(403).json({ message: "Request origin is not allowed" });
  return next();
};
export default validateOrigin;
