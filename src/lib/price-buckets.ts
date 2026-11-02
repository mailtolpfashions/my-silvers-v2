/**
 * Price bands for the storefront filter. Sized to the current catalogue
 * (roughly ₹1,000–₹9,000) — widen them if the range moves.
 *
 * Indian shoppers overwhelmingly browse budget-first, so these are one tap
 * rather than something to type.
 */
export type PriceBucket = {
  label: string;
  min?: number;
  max?: number;
};

export const PRICE_BUCKETS: PriceBucket[] = [
  // Each max is one rupee under the next range's min. The price filter's
  // bounds are inclusive, so with max 1500 a ₹1,500 piece was listed under
  // "Under ₹1,500" AND in "₹1,500 – ₹3,000" — "under" that wasn't, and the same
  // piece in two places. Prices are whole rupees, so 1499 loses nothing, and a
  // charm-priced ₹1,499 now sits only where its label says.
  { label: "Under ₹1,500", max: 1499 },
  { label: "₹1,500 – ₹3,000", min: 1500, max: 2999 },
  { label: "₹3,000 – ₹5,000", min: 3000, max: 4999 },
  { label: "Over ₹5,000", min: 5000 },
];

/** True when a bucket exactly matches the active min/max in the URL. */
export function isBucketActive(
  bucket: PriceBucket,
  min?: string,
  max?: string
): boolean {
  const currentMin = min ? Number(min) : undefined;
  const currentMax = max ? Number(max) : undefined;
  return bucket.min === currentMin && bucket.max === currentMax;
}
