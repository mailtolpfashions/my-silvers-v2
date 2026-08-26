import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { isAllowedMediaUrl } from "@/server/media/url-allowlist";
import {
  MAX_REVIEW_IMAGES,
  MAX_REVIEW_VIDEOS,
  REVIEW_MEDIA_FOLDER,
  formatBytes,
  maxBytesFor,
  type ReviewMediaKind,
} from "@/lib/review-media";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * The check that actually enforces the review-media limits.
 *
 * ⚠️  Read this before trusting the file-size check in the upload widget.
 *
 * `/api/uploads/sign` hands any signed-in shopper a real Cloudinary signature
 * for `mysilvers/reviews`. That signature pins the folder and the permitted
 * formats, but the Cloudinary UPLOAD API has no `max_file_size` parameter —
 * only upload presets do, and those live in the Cloudinary dashboard rather
 * than in this repo. So there is a genuine window in which someone who skips
 * the form can push a 900 MB file into the reviews folder.
 *
 * This module closes it at the only other place it can be closed: submit time.
 * Every URL arriving on a review is treated as a claim, not a fact, and each
 * one is checked against Cloudinary's Admin API for what it REALLY is —
 * because `bytes`, `resource_type` and `format` posted by a browser are just
 * strings a browser chose to send.
 *
 * A URL that fails any check is destroyed rather than merely refused. Leaving
 * it would mean an oversize asset sitting in the account, paid for, reachable
 * by anyone holding the URL, and attached to nothing — an orphan that no screen
 * in the admin would ever show. Destroying it makes the refusal complete.
 */

export class ReviewMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewMediaError";
  }
}

/**
 * `https://res.cloudinary.com/<cloud>/<image|video>/upload/<...>/<public_id>.<ext>`
 *
 * The public ID is everything after the version segment (or after `upload/`
 * when there is none), minus the extension — folders included, which is what
 * makes the folder check below possible.
 */
const CLOUDINARY_ASSET =
  /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/(?:v\d+\/)?(.+)$/;

type ParsedAsset = { kind: ReviewMediaKind; publicId: string; resourceType: "image" | "video" };

function parseCloudinaryUrl(url: string): ParsedAsset | null {
  if (!isAllowedMediaUrl(url)) return null;
  const match = CLOUDINARY_ASSET.exec(url);
  if (!match) return null;

  const [, resourceType, rest] = match;
  // Transformation segments would sit between `upload/` and the id. Nothing
  // writes those here — the widget stores what Cloudinary returned — so a URL
  // carrying them is not one we issued, and is refused rather than unpicked.
  const publicId = rest.replace(/\.[a-z0-9]+$/i, "");

  return {
    kind: resourceType === "video" ? "video" : "image",
    publicId,
    resourceType: resourceType as "image" | "video",
  };
}

/** Best-effort cleanup. A failure here must never take the caller down with it. */
async function destroyQuietly(publicId: string, resourceType: "image" | "video") {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
  } catch (err) {
    console.error("[review-media] could not destroy", publicId, err);
  }
}

/**
 * Verifies one URL against Cloudinary and returns it, or throws.
 *
 * Three questions, in the order that fails cheapest first: is it ours, is it
 * in the reviews folder, and is it within the size limit for its kind.
 */
async function verifyOne(url: string, expected: ReviewMediaKind): Promise<string> {
  const parsed = parseCloudinaryUrl(url);
  if (!parsed) {
    throw new ReviewMediaError("That file could not be attached. Please upload it again.");
  }
  if (parsed.kind !== expected) {
    throw new ReviewMediaError(
      expected === "image"
        ? "One of your photos is not an image file."
        : "That video is not a video file."
    );
  }
  // The folder is part of the public ID, and the signature pinned the folder at
  // upload time — so an asset outside it was never issued by this route. This
  // also stops a shopper attaching a PRODUCT image as if it were their own
  // photo, which would otherwise pass every other check here.
  if (!parsed.publicId.startsWith(`${REVIEW_MEDIA_FOLDER}/`)) {
    throw new ReviewMediaError("That file could not be attached. Please upload it again.");
  }

  let resource: { bytes: number };
  try {
    resource = await cloudinary.api.resource(parsed.publicId, {
      resource_type: parsed.resourceType,
    });
  } catch {
    // 404 from Cloudinary means the URL points at nothing — a fabricated or
    // already-deleted asset. Either way it must not be stored.
    throw new ReviewMediaError("That file is no longer available. Please upload it again.");
  }

  const limit = maxBytesFor(expected);
  if (resource.bytes > limit) {
    await destroyQuietly(parsed.publicId, parsed.resourceType);
    throw new ReviewMediaError(
      expected === "image"
        ? `Photos must be under ${formatBytes(limit)} each.`
        : `Videos must be under ${formatBytes(limit)}.`
    );
  }

  return url;
}

/**
 * Verifies everything a review is trying to attach.
 *
 * Counts are checked before any network call — refusing five photos costs
 * nothing, whereas verifying them first would be four Admin API calls spent on
 * a request that was always going to be refused.
 */
export async function verifyReviewMedia(input: {
  imageUrls?: string[];
  videoUrl?: string | null;
}): Promise<{ imageUrls: string[]; videoUrl: string | null }> {
  // De-duped: the same URL twice is one photo, and would otherwise let someone
  // fill the grid with a single upload.
  const images = [...new Set(input.imageUrls ?? [])];
  const video = input.videoUrl?.trim() || null;

  if (images.length > MAX_REVIEW_IMAGES) {
    throw new ReviewMediaError(`Up to ${MAX_REVIEW_IMAGES} photos, please.`);
  }
  if (video && MAX_REVIEW_VIDEOS < 1) {
    throw new ReviewMediaError("Videos are not accepted.");
  }
  if (images.length === 0 && !video) return { imageUrls: [], videoUrl: null };

  // In parallel: up to five independent HTTP calls, and doing them in sequence
  // would put five round trips on the critical path of a form submit.
  const [verifiedImages, verifiedVideo] = await Promise.all([
    Promise.all(images.map((url) => verifyOne(url, "image"))),
    video ? verifyOne(video, "video") : Promise.resolve(null),
  ]);

  return { imageUrls: verifiedImages, videoUrl: verifiedVideo };
}

/**
 * Removes review media from Cloudinary — called when a review is deleted or
 * when an edit drops an attachment.
 *
 * Deliberately fire-and-forget at the call site: a review must still delete
 * even if Cloudinary is unreachable, or moderation would be blocked by a third
 * party being down. The worst case is a paid-for orphan, which is recoverable;
 * an undeletable review is not.
 */
export async function destroyReviewMedia(urls: Array<string | null | undefined>) {
  const parsed = urls
    .filter((url): url is string => !!url)
    .map(parseCloudinaryUrl)
    .filter((asset): asset is ParsedAsset => !!asset)
    // Same folder fence as above — this function must never be able to delete a
    // product image, however it is called.
    .filter((asset) => asset.publicId.startsWith(`${REVIEW_MEDIA_FOLDER}/`));

  await Promise.all(parsed.map((a) => destroyQuietly(a.publicId, a.resourceType)));
}
