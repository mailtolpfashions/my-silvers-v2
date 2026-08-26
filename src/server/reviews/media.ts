import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { isAllowedMediaUrl } from "@/server/media/url-allowlist";
import {
  MAX_REVIEW_IMAGE_BYTES,
  REVIEW_MEDIA_FOLDER,
  formatBytes,
} from "@/lib/review-media";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * The check that actually enforces the review-photo rules.
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
 * The URL arriving on a review is treated as a claim, not a fact, and is
 * checked against Cloudinary's Admin API for what it REALLY is — because
 * `bytes`, `resource_type` and `format` posted by a browser are just strings a
 * browser chose to send.
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
 * `video` is still matched, and then REFUSED below. Matching only `image` would
 * make a video URL fail as "could not be attached", which is true but useless —
 * and it would leave the uploaded clip sitting in the folder rather than
 * destroyed. Recognising it is what lets it be cleaned up.
 */
const CLOUDINARY_ASSET =
  /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/(?:v\d+\/)?(.+)$/;

type ParsedAsset = { publicId: string; resourceType: "image" | "video" };

function parseCloudinaryUrl(url: string): ParsedAsset | null {
  if (!isAllowedMediaUrl(url)) return null;
  const match = CLOUDINARY_ASSET.exec(url);
  if (!match) return null;

  const [, resourceType, rest] = match;
  // Transformation segments would sit between `upload/` and the id. Nothing
  // writes those here — the widget stores what Cloudinary returned — so a URL
  // carrying them is not one we issued, and is refused rather than unpicked.
  const publicId = rest.replace(/\.[a-z0-9]+$/i, "");

  return { publicId, resourceType: resourceType as "image" | "video" };
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
 * Verifies the single photo a review is trying to attach, and returns it.
 *
 * Returns null when there is nothing to attach. Throws ReviewMediaError with a
 * shopper-readable message when what arrived cannot be accepted.
 */
export async function verifyReviewImage(imageUrl?: string | null): Promise<string | null> {
  const url = imageUrl?.trim();
  if (!url) return null;

  const parsed = parseCloudinaryUrl(url);
  if (!parsed) {
    throw new ReviewMediaError("That photo could not be attached. Please upload it again.");
  }

  // The folder is part of the public ID, and the signature pinned the folder at
  // upload time — so an asset outside it was never issued by this route. This
  // also stops a shopper attaching a PRODUCT image as if it were their own
  // photo, which would otherwise pass every other check here.
  if (!parsed.publicId.startsWith(`${REVIEW_MEDIA_FOLDER}/`)) {
    throw new ReviewMediaError("That photo could not be attached. Please upload it again.");
  }

  if (parsed.resourceType === "video") {
    // Destroyed, not just refused: the clip is already in the folder by the
    // time we see its URL, and nothing will ever reference it.
    await destroyQuietly(parsed.publicId, "video");
    throw new ReviewMediaError("Reviews take a photo, not a video.");
  }

  let resource: { bytes: number };
  try {
    resource = await cloudinary.api.resource(parsed.publicId, { resource_type: "image" });
  } catch {
    // 404 from Cloudinary means the URL points at nothing — a fabricated or
    // already-deleted asset. Either way it must not be stored.
    throw new ReviewMediaError("That photo is no longer available. Please upload it again.");
  }

  if (resource.bytes > MAX_REVIEW_IMAGE_BYTES) {
    await destroyQuietly(parsed.publicId, "image");
    throw new ReviewMediaError(`Photos must be under ${formatBytes(MAX_REVIEW_IMAGE_BYTES)}.`);
  }

  return url;
}

/**
 * Removes review photos from Cloudinary — called when a review is deleted or
 * when an edit drops its photo.
 *
 * Deliberately fire-and-forget at most call sites: a review must still delete
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
