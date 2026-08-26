import dotenv from "dotenv";

dotenv.config();

import app from "./app.js";
import client from "./config/mongodb.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await client.connect();

    console.log("✅ MongoDB Connected");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on ${PORT}`);
    });
  } catch (error) {
    console.error(error);
  }
}

startServer();
