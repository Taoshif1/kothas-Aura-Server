const PRODUCT_FIELDS = ["name", "slug", "description", "category", "subcategory", "brand", "price", "compareAtPrice", "images", "stock", "lowStockThreshold", "sku", "rating", "reviewCount", "featured", "bestseller", "isNew", "active", "specifications", "variants"];
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

export const sanitizeProduct = (input = {}) =>
  Object.fromEntries(PRODUCT_FIELDS.filter((field) => input[field] !== undefined).map((field) => [field, typeof input[field] === "string" ? input[field].trim() : input[field]]));

export const validateProduct = (product, { partial = false } = {}) => {
  const errors = [];
  if (!partial) {
    ["name", "description", "category", "price", "stock", "sku"].forEach((field) => {
      if (product[field] === undefined || product[field] === "") errors.push(`${field} is required`);
    });
  }
  ["name", "slug", "description", "category", "subcategory", "brand", "sku"].forEach((field) => {
    if (product[field] !== undefined && !isNonEmptyString(product[field])) errors.push(`${field} must be a non-empty string`);
  });
  ["price", "compareAtPrice", "stock", "lowStockThreshold", "rating", "reviewCount"].forEach((field) => {
    if (product[field] !== undefined && product[field] !== null && (typeof product[field] !== "number" || !Number.isFinite(product[field]))) errors.push(`${field} must be a number`);
  });
  if (product.price !== undefined && product.price < 0) errors.push("price cannot be negative");
  if (product.compareAtPrice !== undefined && product.compareAtPrice !== null && product.compareAtPrice < 0) errors.push("compareAtPrice cannot be negative");
  if (product.stock !== undefined && (!Number.isInteger(product.stock) || product.stock < 0)) errors.push("stock must be a non-negative integer");
  if (product.lowStockThreshold !== undefined && (!Number.isInteger(product.lowStockThreshold) || product.lowStockThreshold < 0)) errors.push("lowStockThreshold must be a non-negative integer");
  if (product.reviewCount !== undefined && (!Number.isInteger(product.reviewCount) || product.reviewCount < 0)) errors.push("reviewCount must be a non-negative integer");
  if (product.rating !== undefined && (product.rating < 0 || product.rating > 5)) errors.push("rating must be between 0 and 5");
  if (product.images !== undefined && (!Array.isArray(product.images) || !product.images.every(isNonEmptyString))) errors.push("images must be an array of non-empty strings");
  if (product.specifications !== undefined && (typeof product.specifications !== "object" || Array.isArray(product.specifications) || product.specifications === null)) errors.push("specifications must be an object");
  if (product.variants !== undefined && (!Array.isArray(product.variants) || product.variants.some((variant) => !isNonEmptyString(variant.sku) || typeof variant.attributes !== "object" || variant.attributes === null || typeof variant.price !== "number" || !Number.isInteger(variant.stock) || variant.stock < 0 || typeof variant.active !== "boolean"))) errors.push("each variant requires sku, attributes, numeric price, non-negative integer stock, and active status");
  ["featured", "bestseller", "isNew", "active"].forEach((field) => {
    if (product[field] !== undefined && typeof product[field] !== "boolean") errors.push(`${field} must be a boolean`);
  });
  return errors;
};
