const verifyAdmin = (req, res, next) => {
  if (req.currentUser?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  return next();
};

export default verifyAdmin;
