import dotenv from "dotenv";

dotenv.config();

import app from "./app.js";
import client, { ensureIndexes, getDatabase } from "./config/mongodb.js";
import { getFirebaseAdminAuth } from "./config/firebaseAdmin.js";
import { validateEnvironment } from "./config/environment.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    validateEnvironment();
    await client.connect();
    await ensureIndexes();
    getFirebaseAdminAuth();
    console.log(`Database selected: ${getDatabase().databaseName}`);
    console.log("Firebase Admin initialized");

    console.log("✅ MongoDB Connected");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on ${PORT}`);
    });
  } catch (error) {
    console.error(error);
  }
}

startServer();
