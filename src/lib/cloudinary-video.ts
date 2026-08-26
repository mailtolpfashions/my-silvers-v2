/**
 * Delivery URLs for hero video.
 *
 * This exists because of one measurement (audit, Aug 2026): the homepage was
 * shipping a 12.8 MB MP4. Not as an optional extra — as an autoplaying element
 * in the hero, downloaded in full by every visitor before anything else on the
 * page finished. The rest of the homepage put together came to about 1.4 MB.
 *
 * The cause was that the CMS stores whatever Cloudinary returned at upload,
 * and the carousel used that string as `src` verbatim. Cloudinary will happily
 * transcode on delivery, but only if the URL asks it to, and an untransformed
 * URL means "give me back exactly what was uploaded" — a phone camera's
 * original file, at its original bitrate.
 *
 * Two things follow, and they are separate:
 *
 *  1. `heroVideoUrl` asks for a sane variant. `vc_auto` picks a codec the
 *     requesting browser actually supports, `q_auto` targets perceptual quality
 *     rather than a fixed bitrate, and the width cap stops a 4K master being
 *     sent to a 390px phone. Nothing here is lossy in a way a muted, looping,
 *     object-cover background reveals.
 *
 *  2. `heroVideoPosterUrl` gives the element something to paint immediately.
 *     `so_0` is Cloudinary's "still at second zero", so the poster is the
 *     video's own first frame and there is no cut when playback starts.
 *
 * Anything that is not a Cloudinary video URL is handed back untouched —
 * better an unoptimised video than a URL that 404s. Same contract as
 * ogImageUrl(); see the note in og-image.ts.
 */

/** `https://res.cloudinary.com/<cloud>/video/upload/` + everything after it. */
const CLOUDINARY_VIDEO_UPLOAD =
  /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+)$/;

/**
 * 1920 rather than the source width. A hero is `object-cover` across the
 * viewport, so beyond ~1080p the extra pixels are cropped away or resampled
 * down; `c_limit` never upscales, so a smaller master is left alone.
 */
const MAX_WIDTH = 1920;

const VIDEO_TRANSFORM = ["f_auto", "q_auto", "vc_auto", `w_${MAX_WIDTH}`, "c_limit"].join(",");

// f_jpg, not f_auto: a poster is fetched by the browser as an <img>-alike and
// the same negotiation caveat as og-image.ts applies. q_auto:good keeps it
// small enough to arrive before the video does, which is the entire point.
const POSTER_TRANSFORM = ["so_0", "f_jpg", "q_auto:good", `w_${MAX_WIDTH}`, "c_limit"].join(",");

/** The delivery variant of a hero video — transcoded, capped, format-negotiated. */
export function heroVideoUrl(src: string): string {
  const match = CLOUDINARY_VIDEO_UPLOAD.exec(src);
  if (!match) return src;
  const [, base, rest] = match;
  return `${base}${VIDEO_TRANSFORM}/${rest}`;
}

/**
 * A still of the video's first frame, for the `poster` attribute.
 *
 * Returns undefined for anything that is not a Cloudinary video, so the caller
 * can omit the attribute rather than point it at something that does not exist.
 */
export function heroVideoPosterUrl(src: string): string | undefined {
  const match = CLOUDINARY_VIDEO_UPLOAD.exec(src);
  if (!match) return undefined;
  const [, base, rest] = match;
  /**
   * Cloudinary picks the still's format from the extension, and it must
   * REPLACE the video's rather than follow it: appending gives `….mp4.jpg`,
   * which 404s (verified against the live asset — it answers 404 with, of all
   * things, a zero-byte image/gif, so a broken poster fails silently and the
   * hero just shows black until the video arrives).
   *
   * Uploads without an extension are handled by the same expression, which
   * simply appends.
   */
  const stem = rest.replace(/\.(mp4|webm|mov|ogg|m4v)$/i, "");
  return `${base}${POSTER_TRANSFORM}/${stem}.jpg`;
}
