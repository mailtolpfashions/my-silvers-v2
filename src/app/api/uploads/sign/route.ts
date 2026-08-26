import { NextRequest } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { auth } from "@/server/auth/auth";
import { getCurrentRole } from "@/server/auth/require-role";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit/limiter";
import {
  ALLOWED_REVIEW_IMAGE_FORMATS,
  ALLOWED_REVIEW_VIDEO_FORMATS,
  REVIEW_MEDIA_FOLDER,
} from "@/lib/review-media";

/**
 * Cloudinary signed-upload signatures. The browser uploads file bytes
 * DIRECTLY to Cloudinary with this signature — they never pass through a
 * Vercel Function, which sidesteps the Hobby-tier request-body ceiling
 * entirely (the deciding constraint from planning).
 *
 * ── Who may sign what ────────────────────────────────────────────────────────
 * Staff folders (products, categories, CMS) are admin/editor, as they always
 * were. `mysilvers/reviews` is the one folder ANY signed-in shopper may write
 * to, because customers now attach photos and a clip to a review — and the
 * whole point of the direct-upload design is that those bytes never touch a
 * Function.
 *
 * ⚠️  Handing a signature to every logged-in account is a real widening, so it
 * is fenced on three sides and none of them is the browser:
 *
 *   1. FOLDER. The signature covers `folder`, so a signature issued for
 *      reviews cannot be replayed to write into `mysilvers/products`.
 *   2. FORMAT. `allowed_formats` is signed too, so Cloudinary refuses anything
 *      that is not one of the listed image/video types before storing a byte.
 *      This is the only restriction enforced at UPLOAD time.
 *   3. SIZE. Not enforceable here — the upload API has no `max_file_size`
 *      parameter (only upload presets do, which would mean dashboard config).
 *      So it is checked AFTER the fact, in server/reviews/media.ts, which asks
 *      Cloudinary how big each asset really is and destroys what is over the
 *      line. A file that gets past this route still never reaches a review.
 *
 * Plus a rate limit, because this is now reachable by ordinary accounts.
 */
const STAFF_FOLDERS = new Set(["mysilvers/products", "mysilvers/categories", "mysilvers/cms"]);

/** Signed alongside the folder — see fence #2 above. */
const REVIEW_ALLOWED_FORMATS = [
  ...ALLOWED_REVIEW_IMAGE_FORMATS,
  ...ALLOWED_REVIEW_VIDEO_FORMATS,
].join(",");

export async function POST(req: NextRequest) {
  let requested = "mysilvers/products";
  try {
    const body = await req.json();
    if (typeof body?.folder === "string") requested = body.folder;
  } catch {
    // No body — default folder.
  }

  const isReviewUpload = requested === REVIEW_MEDIA_FOLDER;

  // Extra signed params, per folder. Kept in one object so whatever goes into
  // the signature is exactly what goes back to the browser — a mismatch here
  // produces an "Invalid Signature" from Cloudinary that is miserable to trace.
  const extraParams: Record<string, string> = {};
  let folder: string;

  if (isReviewUpload) {
    // Any signed-in shopper. The delivered-order requirement lives on the
    // review itself (upsertReview), not here: someone could burn a signature
    // uploading a photo they can never attach to anything, which costs them
    // their own bandwidth and gets swept up as an orphan.
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return new Response("Forbidden", { status: 403 });

    if (!(await checkRateLimit("uploadSign", userId))) {
      return new Response(RATE_LIMIT_MESSAGE, { status: 429 });
    }

    folder = REVIEW_MEDIA_FOLDER;
    extraParams.allowed_formats = REVIEW_ALLOWED_FORMATS;
  } else {
    // From the database, not the token: session.user.role is written once at
    // sign-in and never refreshed, so a revoked editor would keep this open for
    // as long as their session lasted. See require-role.ts.
    const role = await getCurrentRole();
    if (role !== "admin" && role !== "editor") {
      return new Response("Forbidden", { status: 403 });
    }
    folder = STAFF_FOLDERS.has(requested) ? requested : "mysilvers/products";
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, ...extraParams },
    process.env.CLOUDINARY_API_SECRET!
  );

  return Response.json({
    timestamp,
    signature,
    folder,
    // The browser must post these back verbatim; they are part of what was
    // signed. Empty for staff uploads, which sign folder + timestamp only.
    params: extraParams,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
  });
}
