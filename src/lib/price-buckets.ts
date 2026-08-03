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
  { label: "Under ₹1,500", max: 1500 },
  { label: "₹1,500 – ₹3,000", min: 1500, max: 3000 },
  { label: "₹3,000 – ₹5,000", min: 3000, max: 5000 },
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
