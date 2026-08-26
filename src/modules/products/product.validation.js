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
  if (product.variants !== undefined) {
    if (!Array.isArray(product.variants)) errors.push("variants must be an array");
    else {
      product.variants.forEach((variant, index) => {
        const attributes = variant?.attributes;
        if (!isNonEmptyString(variant?.sku)) errors.push(`variant ${index + 1} requires a SKU`);
        if (!attributes || Array.isArray(attributes) || !Object.keys(attributes).length || Object.entries(attributes).some(([key, value]) => !isNonEmptyString(key) || !isNonEmptyString(value))) errors.push(`variant ${index + 1} requires meaningful string attributes`);
        if (typeof variant?.price !== "number" || !Number.isFinite(variant.price) || variant.price < 0) errors.push(`variant ${index + 1} price must be non-negative`);
        if (variant?.compareAtPrice !== null && variant?.compareAtPrice !== undefined && (typeof variant.compareAtPrice !== "number" || !Number.isFinite(variant.compareAtPrice) || variant.compareAtPrice < 0)) errors.push(`variant ${index + 1} compareAtPrice is invalid`);
        if (!Number.isInteger(variant?.stock) || variant.stock < 0) errors.push(`variant ${index + 1} stock must be a non-negative integer`);
        if (typeof variant?.active !== "boolean") errors.push(`variant ${index + 1} active must be boolean`);
      });
      const skus = product.variants.map((variant) => variant?.sku?.trim().toLowerCase()).filter(Boolean);
      if (new Set(skus).size !== skus.length) errors.push("variant SKUs must be unique within the product");
    }
  }
  ["featured", "bestseller", "isNew", "active"].forEach((field) => {
    if (product[field] !== undefined && typeof product[field] !== "boolean") errors.push(`${field} must be a boolean`);
  });
  return errors;
};
