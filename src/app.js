import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import productRoutes from "./modules/products/product.routes.js";
import categoryRoutes from "./modules/categories/category.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import wishlistRoutes from "./modules/wishlist/wishlist.routes.js";
import validateOrigin from "./middleware/validateOrigin.js";
import { getAllowedOrigins } from "./config/environment.js";
import settingsRoutes from "./modules/settings/settings.routes.js";
import addressRoutes from "./modules/addresses/address.routes.js";
import checkoutRoutes from "./modules/checkout/checkout.routes.js";
import orderRoutes from "./modules/orders/order.routes.js";
import adminOrderRoutes from "./modules/orders/adminOrder.routes.js";
import adminCustomerRoutes from "./modules/users/adminCustomer.routes.js";
import couponRoutes from "./modules/coupons/coupon.routes.js";
import contactRoutes from "./modules/contact/contact.routes.js";
import adminContactRoutes from "./modules/contact/adminContact.routes.js";
import newsletterRoutes from "./modules/newsletter/newsletter.routes.js";
import adminNewsletterRoutes from "./modules/newsletter/adminNewsletter.routes.js";
import reviewRoutes from "./modules/reviews/review.routes.js";
import adminReviewRoutes from "./modules/reviews/adminReview.routes.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || getAllowedOrigins().includes(origin)) return callback(null, true);
      return callback(Object.assign(new Error("CORS origin is not allowed"), { status: 403 }));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "100kb" }));

app.use(cookieParser());
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api", validateOrigin);

app.get("/", (req, res) => {
  res.send("Kotha's Aura Server Running...");
});
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin/orders", adminOrderRoutes);
app.use("/api/admin/customers", adminCustomerRoutes);
app.use("/api/admin/coupons", couponRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin/contact", adminContactRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/admin/subscribers", adminNewsletterRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/admin/reviews", adminReviewRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
