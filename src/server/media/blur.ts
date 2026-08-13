import "server-only";
import { cacheLife } from "next/cache";

/**
 * Low-quality image placeholders — the blurred preview a tile shows while its
 * photograph downloads.
 *
 * ── The problem ──────────────────────────────────────────────────────────────
 * Every product image on the storefront is remote (Cloudinary), and next/image
 * only generates `blurDataURL` automatically for STATIC imports. So the grid
 * showed a flat `bg-muted` rectangle until each photograph decoded, which on a
 * fast scroll is a screen of grey boxes.
 *
 * ── Why this is fetched rather than stored on the Product row ────────────────
 * The obvious alternative is a `imageBlurs String[]` column filled at upload
 * time. It would be marginally faster, and it was not chosen: it needs a
 * migration, a change to the admin save path, a backfill for the existing
 * catalogue, and an index-alignment invariant between two arrays that nothing
 * enforces. This needs none of that and covers images uploaded before it
 * existed.
 *
 * The cost is one tiny fetch per distinct image, ONCE — `use cache` with the
 * `max` profile holds the result effectively forever, which is safe here for
 * the same reason `minimumCacheTTL` in next.config.ts is a month: a Cloudinary
 * public ID changes whenever the asset does, so a stale entry is unreachable
 * rather than wrong.
 *
 * If the catalogue ever grows to the point where cold renders feel it, the
 * upgrade path is to precompute into a column and keep this as the fallback.
 */

/** `https://res.cloudinary.com/<cloud>/image/upload/` + everything after it. */
const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

/**
 * 12px wide, heavily blurred, quality 20.
 *
 * It is stretched over the whole tile and then blurred again by the browser, so
 * detail is pointless — every byte here is inlined into the HTML of every page
 * the image appears on. These land around 400–700 bytes; at 24 tiles that is
 * ~15KB of markup, which is the budget this transform is tuned to.
 */
const TINY = "w_12,q_20,e_blur:400,f_jpg";

/**
 * Hard ceiling, because the transform is not the only thing that decides size —
 * a busy photograph can still come back larger. Next's own docs warn that a
 * large blurDataURL hurts more than it helps, so an oversized one is dropped
 * and the tile falls back to its plain `bg-muted`.
 */
const MAX_BYTES = 2048;

/** How long to wait on Cloudinary before rendering without a placeholder. */
const TIMEOUT_MS = 3000;

/**
 * The blurred preview for one image, or undefined if there isn't one.
 *
 * Never throws. A placeholder is a nicety — a page must not fail, or even slow
 * down noticeably, because a CDN was briefly unreachable.
 */
export async function getBlurDataUrl(src: string): Promise<string | undefined> {
  "use cache";
  cacheLife("max");

  const match = CLOUDINARY_UPLOAD.exec(src);
  // Anything else — the demo catalogue's placehold.co images, mainly — has no
  // transformation API to ask, so it simply goes without.
  if (!match) return undefined;

  try {
    const response = await fetch(`${match[1]}${TINY}/${match[2]}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return undefined;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return undefined;

    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/**
 * Attaches a placeholder to the FIRST image of each item — the one the tile
 * shows. The hover image is never the thing a shopper is waiting on.
 *
 * Resolved in parallel, and the whole thing is a no-op for items already
 * carrying one, so it is safe to call on a list that has been through here.
 */
export async function withBlurPlaceholders<T extends { images: string[]; blurDataUrl?: string }>(
  items: T[],
): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => {
      const src = item.images[0];
      if (!src || item.blurDataUrl) return item;
      return { ...item, blurDataUrl: await getBlurDataUrl(src) };
    }),
  );
}
