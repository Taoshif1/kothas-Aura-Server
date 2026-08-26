import { ObjectId } from "mongodb";
import { getDatabase } from "../../config/mongodb.js";
import createSlug from "../../utils/createSlug.js";
import { sanitizeProduct, validateProduct } from "./product.validation.js";

const collection = () => getDatabase().collection("products");
const httpError = (status, message, errors) => Object.assign(new Error(message), { status, errors });
const parseId = (id) => {
  if (!ObjectId.isValid(id)) throw httpError(400, "Invalid product id");
  return new ObjectId(id);
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const getProducts = async (req, res) => {
  const { search, category, subcategory, featured, sort = "newest" } = req.query;
  const filter = { active: { $ne: false } };
  if (search?.trim()) {
    const escaped = escapeRegex(search.trim());
    filter.$or = ["name", "description", "category", "subcategory", "sku"].map((field) => ({ [field]: { $regex: escaped, $options: "i" } }));
  }
  if (category?.trim()) filter.category = { $regex: `^${escapeRegex(category.trim())}$`, $options: "i" };
  if (subcategory?.trim()) filter.subcategory = { $regex: `^${escapeRegex(subcategory.trim())}$`, $options: "i" };
  if (featured === "true") filter.featured = true;
  const sorts = { newest: { createdAt: -1 }, price_asc: { price: 1 }, price_desc: { price: -1 }, popularity: { rating: -1, reviewCount: -1 } };
  const result = await collection().find(filter).sort(sorts[sort] || sorts.newest).toArray();
  res.json({ products: result, count: result.length });
};

export const getProductById = async (req, res) => {
  const product = await collection().findOne({ _id: parseId(req.params.id), active: { $ne: false } });
  if (!product) throw httpError(404, "Product not found");
  res.json({ product });
};

export const createProduct = async (req, res) => {
  const product = sanitizeProduct(req.body);
  product.slug ||= createSlug(product.name);
  const errors = validateProduct(product);
  if (errors.length) throw httpError(400, "Validation failed", errors);
  const duplicate = await collection().findOne({ $or: [{ slug: product.slug }, { sku: product.sku }] });
  if (duplicate) throw httpError(409, "A product with this slug or SKU already exists");
  const now = new Date();
  const document = { ...product, images: product.images || [], compareAtPrice: product.compareAtPrice ?? null, subcategory: product.subcategory || "", brand: product.brand || "", lowStockThreshold: product.lowStockThreshold ?? 5, specifications: product.specifications || {}, variants: product.variants || [], rating: product.rating ?? 0, reviewCount: product.reviewCount ?? 0, featured: product.featured ?? false, bestseller: product.bestseller ?? false, isNew: product.isNew ?? false, active: product.active ?? true, createdAt: now, updatedAt: now };
  const result = await collection().insertOne(document);
  res.status(201).json({ product: { ...document, _id: result.insertedId } });
};

export const updateProduct = async (req, res) => {
  const changes = sanitizeProduct(req.body);
  if (!Object.keys(changes).length) throw httpError(400, "No valid product fields provided");
  if (changes.name && !changes.slug) changes.slug = createSlug(changes.name);
  const errors = validateProduct(changes, { partial: true });
  if (errors.length) throw httpError(400, "Validation failed", errors);
  const _id = parseId(req.params.id);
  if (changes.slug || changes.sku) {
    const duplicateFilters = [];
    if (changes.slug) duplicateFilters.push({ slug: changes.slug });
    if (changes.sku) duplicateFilters.push({ sku: changes.sku });
    const duplicate = await collection().findOne({ _id: { $ne: _id }, $or: duplicateFilters });
    if (duplicate) throw httpError(409, "A product with this slug or SKU already exists");
  }
  const result = await collection().findOneAndUpdate({ _id }, { $set: { ...changes, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw httpError(404, "Product not found");
  res.json({ product: result });
};

export const deleteProduct = async (req, res) => {
  const result = await collection().findOneAndUpdate({ _id: parseId(req.params.id) }, { $set: { active: false, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw httpError(404, "Product not found");
  res.json({ product: result });
};

export const getAdminProducts = async (req, res) => {
  const result = await collection().find({}).sort({ createdAt: -1 }).toArray();
  res.json({ products: result, count: result.length });
};
