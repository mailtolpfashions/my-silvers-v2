/**
 * Query-string value for "products with no vendor set" in the admin product
 * filter. Lives here rather than in server/products/admin.ts because the
 * filter control is a client component, and that module imports Prisma.
 */
export const NO_VENDOR = "__none";
