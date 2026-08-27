import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const user = encodeURIComponent(process.env.DB_USER);
const pass = encodeURIComponent(process.env.DB_PASS);

const uri = `mongodb+srv://${user}:${pass}@cluster0.kpmcxd4.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

export const getDatabase = () =>
  client.db(process.env.DB_NAME || "kothasaura");

export const ensureIndexes = async () => {
  const database = getDatabase();
  await Promise.all([
    database.collection("products").createIndex({ slug: 1 }, { unique: true }),
    database.collection("products").createIndex({ sku: 1 }, { unique: true }),
    database.collection("categories").createIndex({ slug: 1 }, { unique: true }),
    database.collection("users").createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } }),
    database.collection("users").createIndex({ firebaseUid: 1 }, { unique: true }),
    database.collection("carts").createIndex({ userId: 1 }, { unique: true }),
    database.collection("wishlist").createIndex({ userId: 1 }, { unique: true }),
    database.collection("orders").createIndex({ orderNumber: 1 }, { unique: true }),
    database.collection("orders").createIndex({ idempotencyKey: 1 }, { unique: true }),
    database.collection("orders").createIndex({ "payment.transactionId": 1 }, { unique: true, partialFilterExpression: { "payment.transactionId": { $type: "string", $gt: "" } } }),
    database.collection("orders").createIndex({ orderStatus: 1, createdAt: -1 }),
    database.collection("reviews").createIndex({ userId: 1, productId: 1 }, { unique: true }),
    database.collection("reviews").createIndex({ productId: 1, status: 1, createdAt: -1 }),
    database.collection("coupons").createIndex({ code: 1 }, { unique: true }),
    database.collection("newsletterSubscribers").createIndex({ email: 1 }, { unique: true }),
    database.collection("contactMessages").createIndex({ status: 1, createdAt: -1 }),
  ]);
};

export default client;
