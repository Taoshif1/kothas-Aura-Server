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
const ensureSkuAvailability = async (product, excludedId) => {
  const skus = [product.sku, ...(product.variants || []).map((variant) => variant.sku)].filter(Boolean);
  if (!skus.length) return;
  const filter = { $or: [{ sku: { $in: skus } }, { "variants.sku": { $in: skus } }] };
  if (excludedId) filter._id = { $ne: excludedId };
  if (await collection().findOne(filter)) throw httpError(409, "A base or variant SKU already exists on another product");
};

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
  const minPrice = Number(req.query.minPrice); const maxPrice = Number(req.query.maxPrice);
  if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) filter.price = { ...(Number.isFinite(minPrice) && { $gte: minPrice }), ...(Number.isFinite(maxPrice) && { $lte: maxPrice }) };
  if (req.query.availability === "in_stock") filter.$expr = { $gt: [{ $cond: [{ $gt: [{ $size: { $ifNull: ["$variants", []] } }, 0] }, { $sum: { $map: { input: { $filter: { input: "$variants", as: "variant", cond: { $ne: ["$$variant.active", false] } } }, as: "variant", in: "$$variant.stock" } } }, "$stock"] }, 0] };
  const sorts = { newest: { createdAt: -1 }, price_asc: { price: 1 }, price_desc: { price: -1 }, popularity: { rating: -1, reviewCount: -1 } };
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1); const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 24));
  const [result, count] = await Promise.all([collection().find(filter).sort(sorts[sort] || sorts.newest).skip((page - 1) * limit).limit(limit).toArray(), collection().countDocuments(filter)]);
  res.json({ products: result, count, page, limit, totalPages: Math.ceil(count / limit) });
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
  if (await collection().findOne({ slug: product.slug })) throw httpError(409, "Product slug already exists");
  await ensureSkuAvailability(product);
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
  const existing = await collection().findOne({ _id });
  if (!existing) throw httpError(404, "Product not found");
  await ensureSkuAvailability({ sku: changes.sku ?? existing.sku, variants: changes.variants ?? existing.variants }, _id);
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
