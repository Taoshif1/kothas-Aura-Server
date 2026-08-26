import { ObjectId } from "mongodb";
import { getDatabase } from "../../config/mongodb.js";
import createSlug from "../../utils/createSlug.js";

const collection = () => getDatabase().collection("categories");
const httpError = (status, message) => Object.assign(new Error(message), { status });
const parseId = (id) => {
  if (!ObjectId.isValid(id)) throw httpError(400, "Invalid category id");
  return new ObjectId(id);
};
const clean = (body = {}) => ({
  ...(body.name !== undefined && { name: String(body.name).trim() }),
  ...(body.slug !== undefined && { slug: String(body.slug).trim() }),
  ...(body.subcategories !== undefined && { subcategories: body.subcategories }),
  ...(body.image !== undefined && { image: String(body.image).trim() }),
  ...(body.active !== undefined && { active: body.active }),
});
const validate = (category, partial = false) => {
  if (!partial && !category.name) throw httpError(400, "name is required");
  if (category.name !== undefined && !category.name) throw httpError(400, "name must be a non-empty string");
  if (category.subcategories !== undefined && (!Array.isArray(category.subcategories) || !category.subcategories.every((item) => typeof item === "string" && item.trim()))) throw httpError(400, "subcategories must be an array of non-empty strings");
  if (category.active !== undefined && typeof category.active !== "boolean") throw httpError(400, "active must be a boolean");
};

export const getCategories = async (req, res) => {
  const categories = await collection().find({ active: { $ne: false } }).sort({ name: 1 }).toArray();
  res.json({ categories, count: categories.length });
};

export const getAdminCategories = async (req, res) => {
  const categories = await collection().find({}).sort({ name: 1 }).toArray();
  res.json({ categories, count: categories.length });
};

export const createCategory = async (req, res) => {
  const category = clean(req.body);
  validate(category);
  category.slug ||= createSlug(category.name);
  if (await collection().findOne({ slug: category.slug })) throw httpError(409, "Category slug already exists");
  const now = new Date();
  const document = { ...category, subcategories: (category.subcategories || []).map((item) => item.trim()), active: category.active ?? true, createdAt: now, updatedAt: now };
  const result = await collection().insertOne(document);
  res.status(201).json({ category: { ...document, _id: result.insertedId } });
};

export const updateCategory = async (req, res) => {
  const changes = clean(req.body);
  if (!Object.keys(changes).length) throw httpError(400, "No valid category fields provided");
  validate(changes, true);
  if (changes.name && !changes.slug) changes.slug = createSlug(changes.name);
  if (changes.subcategories) changes.subcategories = changes.subcategories.map((item) => item.trim());
  const _id = parseId(req.params.id);
  if (changes.slug && await collection().findOne({ _id: { $ne: _id }, slug: changes.slug })) throw httpError(409, "Category slug already exists");
  const result = await collection().findOneAndUpdate({ _id }, { $set: { ...changes, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) throw httpError(404, "Category not found");
  res.json({ category: result });
};

export const deleteCategory = async (req, res) => {
  const result = await collection().deleteOne({ _id: parseId(req.params.id) });
  if (!result.deletedCount) throw httpError(404, "Category not found");
  res.status(204).send();
};
