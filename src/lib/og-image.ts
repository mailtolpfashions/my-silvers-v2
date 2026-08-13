/**
 * Turning a catalogue photograph into a link-preview thumbnail.
 *
 * This exists for one reason: what WhatsApp, iMessage and Slack draw when a
 * shopper shares a product link. None of them run JavaScript — they fetch the
 * page, read `og:image`, and download whatever it points at. So the preview is
 * only ever as good as the URL this function returns.
 *
 * Three things about those crawlers shape every choice below:
 *
 *  1. They will not negotiate a format. `f_auto` is a trap — Cloudinary answers
 *     a bare crawler with WebP or AVIF, and WhatsApp renders neither. Forced to
 *     JPEG.
 *  2. They give up on a slow or heavy image and fall back to a bare grey card.
 *     `q_auto:good` at 1200x630 lands well under WhatsApp's limit.
 *  3. They crop. A pendant on a chain cropped to 1.91:1 loses either the stone
 *     or the chain, so the image is PADDED into that frame rather than filled —
 *     `b_auto` samples the photograph's own border so the padding is invisible
 *     against our light product backgrounds.
 *
 * Anything that is not a Cloudinary upload (the demo catalogue's placehold.co
 * images, mainly) is handed back untouched: better a wrongly-sized preview than
 * a URL that 404s.
 */

/** 1.91:1 — what every unfurler crops to anyway, so we may as well arrive that way. */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** `https://res.cloudinary.com/<cloud>/image/upload/` + everything after it. */
const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

const TRANSFORM = [
  `w_${OG_IMAGE_WIDTH}`,
  `h_${OG_IMAGE_HEIGHT}`,
  "c_pad",
  "b_auto",
  "f_jpg",
  "q_auto:good",
].join(",");

/** The share-preview variant of a product image, sized and flattened to JPEG. */
export function ogImageUrl(src: string): string {
  const match = CLOUDINARY_UPLOAD.exec(src);
  if (!match) return src;
  const [, base, rest] = match;
  return `${base}${TRANSFORM}/${rest}`;
}

/**
 * A ready-made `openGraph.images` entry.
 *
 * The explicit width and height matter more than they look: without them
 * WhatsApp has to download the file before it knows the shape, and if it times
 * out first it falls back to the small square thumbnail instead of the large
 * card. Declaring the dimensions is what buys the big preview.
 */
export function ogImage(src: string, alt: string) {
  return {
    url: ogImageUrl(src),
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    alt,
    type: "image/jpeg",
  };
}
