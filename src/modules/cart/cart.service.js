import { ObjectId } from "mongodb";

export const MAX_CART_QUANTITY = 20;
export const itemKey = (item) => `${item.productId}:${item.variantSku || ""}`;
export const validateQuantity = (quantity) => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) throw Object.assign(new Error(`quantity must be an integer between 1 and ${MAX_CART_QUANTITY}`), { status: 400 });
};

export const validateCartSelection = (product, variantSku, quantity) => {
  validateQuantity(quantity);
  if (!product || product.active === false) throw Object.assign(new Error(product ? "Product is inactive" : "Product not found"), { status: product ? 409 : 404 });
  const variants = product.variants || [];
  if (variants.length) {
    if (!variantSku) throw Object.assign(new Error("variantSku is required for this product"), { status: 400 });
    const variant = variants.find((item) => item.sku === variantSku);
    if (!variant) throw Object.assign(new Error("Selected variant does not exist"), { status: 400 });
    if (!variant.active) throw Object.assign(new Error("Selected variant is inactive"), { status: 409 });
    if (quantity > variant.stock) throw Object.assign(new Error("Requested quantity exceeds available stock"), { status: 409 });
    return variant;
  }
  if (variantSku) throw Object.assign(new Error("variantSku is not valid for a simple product"), { status: 400 });
  if (quantity > product.stock) throw Object.assign(new Error("Requested quantity exceeds available stock"), { status: 409 });
  return null;
};

export const hydrateCartItems = (items, products) => {
  const byId = new Map(products.map((product) => [product._id.toString(), product]));
  return items.map((item) => {
    const product = byId.get(item.productId.toString());
    const variant = product?.variants?.find((entry) => entry.sku === item.variantSku);
    const hasVariants = Boolean(product?.variants?.length);
    const availableStock = hasVariants ? (variant?.active ? variant.stock : 0) : (product?.stock || 0);
    const available = Boolean(product && product.active !== false && (!hasVariants || variant?.active) && availableStock >= item.quantity);
    const unitPrice = variant?.price ?? product?.price ?? 0;
    return { productId: item.productId, name: product?.name || "Unavailable product", image: product?.images?.[0] || "", sku: variant?.sku || product?.sku || "", variantSku: item.variantSku || null, selectedAttributes: variant?.attributes || {}, unitPrice, compareAtPrice: variant?.compareAtPrice ?? product?.compareAtPrice ?? null, quantity: item.quantity, availableStock, available, lineTotal: unitPrice * item.quantity };
  });
};

export const mergeCartItems = (existing, incoming) => {
  const merged = new Map(existing.map((item) => [itemKey(item), item]));
  incoming.forEach((item) => {
    const key = itemKey(item);
    const current = merged.get(key);
    merged.set(key, current ? { ...current, quantity: Math.max(current.quantity, item.quantity), updatedAt: new Date() } : item);
  });
  return [...merged.values()];
};

export const parseProductId = (value) => {
  if (!ObjectId.isValid(value)) throw Object.assign(new Error("Invalid productId"), { status: 400 });
  return new ObjectId(value);
};
