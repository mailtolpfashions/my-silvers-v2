/**
 * Products fetched per page by the storefront grid.
 *
 * Lives outside src/actions/product-list-actions.ts because a "use server"
 * module may only export async functions — exporting a const from one is a
 * build error.
 */
export const PRODUCT_PAGE_SIZE = 24;
