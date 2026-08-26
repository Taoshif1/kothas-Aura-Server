import { ObjectId } from "mongodb";
export const uniqueProductIds = (values) => [...new Map(values.map((value) => [value.toString(), value])).values()];
export const parseWishlistId = (value) => { if (!ObjectId.isValid(value)) throw Object.assign(new Error("Invalid product id"), { status: 400 }); return new ObjectId(value); };
