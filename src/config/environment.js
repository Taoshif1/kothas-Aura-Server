const splitOrigins = (value = "") => value.split(",").map((item) => item.trim()).filter(Boolean);

export const getAllowedOrigins = () => [
  ...splitOrigins(process.env.CLIENT_URL),
  ...splitOrigins(process.env.LIVE_CLIENT_URL),
  ...(process.env.NODE_ENV !== "production" ? ["http://localhost:5173", "http://127.0.0.1:5173"] : []),
].filter((origin, index, list) => list.indexOf(origin) === index);

export const validateEnvironment = () => {
  const required = ["DB_USER", "DB_PASS", "DB_NAME", "JWT_SECRET"];
  const missing = required.filter((name) => !process.env[name]);
  const firebaseReady = process.env.FIREBASE_SERVICE_ACCOUNT || (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
  if (!firebaseReady) missing.push("Firebase Admin configuration");
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(", ")}`);
};
