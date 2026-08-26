/**
 * The one place the review-photo limits are written down.
 *
 * Imported by BOTH the browser (for the instant "that file is too big" toast)
 * and the server (for the check that actually counts). They must not drift:
 * a client that allows 8 MB against a server that stores 5 MB produces an
 * upload that succeeds, costs the shopper their data, and is then refused at
 * submit — which is the worst of both.
 *
 * ⚠️  The client check is COURTESY, not enforcement. `/api/uploads/sign` hands
 * out a real Cloudinary signature, so anyone can skip the form and upload
 * whatever they like into the reviews folder. What makes these numbers true is
 * server/reviews/media.ts, which asks Cloudinary how big the asset actually is
 * and destroys anything over the line. See the note there.
 *
 * ── One photo, no video ──────────────────────────────────────────────────────
 * This carried four photos and a 50 MB clip. Both went when the review grid
 * gained a fixed photo band at the top of each card: there is one slot, so a
 * second photo has nowhere to render and a video has no shape that fits at all.
 * Widening it again means changing the card first, not this file.
 */

/** Cloudinary folder for customer review photos — separate from every admin folder. */
export const REVIEW_MEDIA_FOLDER = "mysilvers/reviews";

/** One. See the note above before raising it. */
export const MAX_REVIEW_IMAGES = 1;

const MB = 1024 * 1024;

/** A phone photo is typically 2–4 MB, so 5 clears one without resizing. */
export const MAX_REVIEW_IMAGE_BYTES = 5 * MB;

/**
 * Formats Cloudinary itself will accept into this folder.
 *
 * These are signed into the upload request, so Cloudinary rejects anything else
 * before a byte is stored — the one restriction that IS enforced at upload time
 * rather than after it. Video formats are deliberately absent: that refusal is
 * what stops someone posting a clip straight to the signed endpoint now that
 * the form no longer offers it. Keep in sync with the `accept` attribute on the
 * file input.
 */
export const ALLOWED_REVIEW_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "heic", "heif"] as const;

/** "5 MB" — for limit copy and error messages, so both quote the same figure. */
export function formatBytes(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}
