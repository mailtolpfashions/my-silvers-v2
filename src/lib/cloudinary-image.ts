/**
 * Cloudinary delivery transforms for images that bypass Next's optimizer.
 *
 * Next's <Image> resizes and re-encodes everything it serves. A raw
 * <source srcSet> inside a <picture> does not — the browser fetches exactly
 * the URL it is given. The hero's hand-cropped PHONE photograph goes that way
 * (so the editor's crop is kept), and it was shipping the original upload:
 * a 1.6–1.8 MB PNG per slide, three slides, on the page a phone opens first.
 * Lighthouse (Nov 2026) measured the live homepage at 5.8 MB and its main
 * content at 14.3 s on a mid-range phone.
 *
 * Cloudinary does the same job as the optimizer when asked in the URL:
 *   f_auto   — AVIF/WebP to browsers that take them, JPEG to the rest
 *   q_auto   — perceptual quality, typically a tenth of a PNG's weight
 *   c_limit  — shrink to the width, never enlarge, NEVER crop: the editor's
 *              hand-made portrait framing survives untouched
 *   w_<n>    — one rendition per width in the srcset
 */

/** `https://res.cloudinary.com/<cloud>/image/upload/` + everything after it. */
const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

/** Phone widths that matter: a 360–430px screen at 2–3x density. */
const PHONE_WIDTHS = [640, 828, 1080, 1290] as const;

/** One width of a Cloudinary image, compressed and format-negotiated. Non-Cloudinary URLs pass through. */
export function cloudinaryWidth(src: string, width: number): string {
  const match = CLOUDINARY_UPLOAD.exec(src);
  if (!match) return src;
  const [, base, rest] = match;
  return `${base}f_auto,q_auto,c_limit,w_${width}/${rest}`;
}

/**
 * A `srcSet` for a full-width phone image. A non-Cloudinary URL is returned
 * as-is (a single candidate), so nothing that worked before can break.
 */
export function phoneSrcSet(src: string): string {
  if (!CLOUDINARY_UPLOAD.test(src)) return src;
  return PHONE_WIDTHS.map((w) => `${cloudinaryWidth(src, w)} ${w}w`).join(", ");
}
