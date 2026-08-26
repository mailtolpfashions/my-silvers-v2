/**
 * The one place the review-media limits are written down.
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
 */

/** Cloudinary folder for customer review media — separate from every admin folder. */
export const REVIEW_MEDIA_FOLDER = "mysilvers/reviews";

export const MAX_REVIEW_IMAGES = 4;
export const MAX_REVIEW_VIDEOS = 1;

const MB = 1024 * 1024;

/** A phone photo is typically 2–4 MB, so 5 clears one without resizing. */
export const MAX_REVIEW_IMAGE_BYTES = 5 * MB;

/**
 * Roughly 30–60 seconds of phone video. Deliberately well under Cloudinary's
 * 100 MB per-file ceiling — the point is a shopper showing how a piece wears,
 * not a film.
 */
export const MAX_REVIEW_VIDEO_BYTES = 50 * MB;

/**
 * Formats Cloudinary itself will accept into this folder.
 *
 * These are signed into the upload request, so Cloudinary rejects anything
 * else before a byte is stored — this is the one restriction that IS enforced
 * at upload time rather than after it. Keep the two lists in sync with the
 * `accept` attributes on the file inputs.
 */
export const ALLOWED_REVIEW_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "heic", "heif"] as const;
export const ALLOWED_REVIEW_VIDEO_FORMATS = ["mp4", "mov", "webm", "m4v"] as const;

export type ReviewMediaKind = "image" | "video";

export function maxBytesFor(kind: ReviewMediaKind): number {
  return kind === "image" ? MAX_REVIEW_IMAGE_BYTES : MAX_REVIEW_VIDEO_BYTES;
}

/** "5 MB" — for limit copy and error messages, so both quote the same figure. */
export function formatBytes(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}
