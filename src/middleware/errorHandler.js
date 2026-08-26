export const notFoundHandler = (req, res) => {
  res.status(404).json({ message: "Route not found" });
};

export const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  console.error(error.message);
  return res.status(error.status || 500).json({
    message: error.status ? error.message : "Internal server error",
    ...(error.errors && { errors: error.errors }),
  });
};
