const appPromise = import("../src/app.js").then(({ default: app }) => app);

const errorCategory = (error) => {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("mongo") || message.includes("uri")) return "database_configuration";
  if (message.includes("firebase") || message.includes("credential") || message.includes("private key")) {
    return "firebase_configuration";
  }
  return "application_initialization";
};

export default async function handler(request, response) {
  try {
    const app = await appPromise;
    return app(request, response);
  } catch (error) {
    const category = errorCategory(error);
    console.error(`Server initialization failed: ${category}`);
    return response.status(500).json({
      error: "SERVER_INITIALIZATION_FAILED",
      category,
    });
  }
}
