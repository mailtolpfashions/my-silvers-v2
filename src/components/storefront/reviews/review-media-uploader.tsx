"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { uploadToCloudinary } from "@/lib/cloudinary-upload";
import { reviewVideoPosterUrl } from "@/lib/cloudinary-video";
import {
  MAX_REVIEW_IMAGES,
  MAX_REVIEW_IMAGE_BYTES,
  MAX_REVIEW_VIDEO_BYTES,
  REVIEW_MEDIA_FOLDER,
  formatBytes,
} from "@/lib/review-media";

/**
 * Photos and one clip, attached to a review.
 *
 * ⚠️  The size checks in here are COURTESY, not security. They exist so a
 * shopper on a phone connection finds out a 200 MB file is too big before
 * spending four minutes uploading it — not to keep it out. Everything is
 * re-checked against Cloudinary at submit, in server/reviews/media.ts, and that
 * check is the one that decides. Changing a number here changes nothing about
 * what the shop will accept; change it in lib/review-media.ts, which both sides
 * import.
 *
 * Uploads go straight from the browser to Cloudinary, as everywhere else in
 * this codebase — the bytes never pass through a Function.
 */
export function ReviewMediaUploader({
  imageUrls,
  videoUrl,
  onImagesChange,
  onVideoChange,
  disabled,
}: {
  imageUrls: string[];
  videoUrl: string | null;
  onImagesChange: (urls: string[]) => void;
  onVideoChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"images" | "video" | null>(null);

  const room = MAX_REVIEW_IMAGES - imageUrls.length;

  async function handleImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const chosen = Array.from(files).slice(0, room);

    if (chosen.some((f) => f.size > MAX_REVIEW_IMAGE_BYTES)) {
      toast.error(`Photos must be under ${formatBytes(MAX_REVIEW_IMAGE_BYTES)} each.`);
      return;
    }

    setBusy("images");
    try {
      // Sequential, not Promise.all. Four simultaneous uploads on a phone
      // connection contend for the same pipe and all four finish slower; worse,
      // a failure part-way leaves it unclear which ones landed.
      const uploaded: string[] = [];
      for (const file of chosen) {
        uploaded.push(await uploadToCloudinary(file, REVIEW_MEDIA_FOLDER));
      }
      onImagesChange([...imageUrls, ...uploaded]);
      toast.success(uploaded.length === 1 ? "Photo added." : `${uploaded.length} photos added.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function handleVideo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_REVIEW_VIDEO_BYTES) {
      toast.error(`Videos must be under ${formatBytes(MAX_REVIEW_VIDEO_BYTES)}.`);
      return;
    }

    setBusy("video");
    try {
      onVideoChange(await uploadToCloudinary(file, REVIEW_MEDIA_FOLDER));
      toast.success("Video added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  const poster = videoUrl ? reviewVideoPosterUrl(videoUrl) : undefined;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Photos &amp; video <span className="font-normal text-muted-foreground">(optional)</span>
      </p>

      <div className="flex flex-wrap gap-2">
        {imageUrls.map((url, i) => (
          <div key={url} className="relative size-16 overflow-hidden rounded-md border">
            <Image src={url} alt={`Photo ${i + 1}`} fill sizes="64px" className="object-cover" />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onImagesChange(imageUrls.filter((u) => u !== url))}
              aria-label={`Remove photo ${i + 1}`}
              // Always visible rather than revealed on hover: this control gets
              // used on a phone as often as on a desktop, and there is no hover
              // there — the admin uploader's hover-only X is unreachable.
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {videoUrl && (
          <div className="relative size-16 overflow-hidden rounded-md border bg-black">
            {poster ? (
              <Image src={poster} alt="Your video" fill sizes="64px" className="object-cover" />
            ) : (
              <Video className="absolute inset-0 m-auto size-5 text-white" />
            )}
            {/* The badge is the only thing telling a still frame apart from a photo. */}
            <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] uppercase tracking-wide text-white">
              Video
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onVideoChange(null)}
              aria-label="Remove video"
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
            >
              <X className="size-3" />
            </button>
          </div>
        )}

        {room > 0 && (
          <button
            type="button"
            disabled={disabled || busy !== null}
            onClick={() => imageInputRef.current?.click()}
            className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed text-[10px] text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {busy === "images" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            {busy === "images" ? "Uploading" : "Photo"}
          </button>
        )}

        {!videoUrl && (
          <button
            type="button"
            disabled={disabled || busy !== null}
            onClick={() => videoInputRef.current?.click()}
            className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed text-[10px] text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {busy === "video" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Video className="size-4" />
            )}
            {busy === "video" ? "Uploading" : "Video"}
          </button>
        )}
      </div>

      <input
        ref={imageInputRef}
        // Kept in step with ALLOWED_REVIEW_IMAGE_FORMATS, which is what
        // Cloudinary actually enforces. A bare `image/*` would let a phone offer
        // formats the signature rejects, so the refusal would arrive after the
        // upload had finished rather than in the picker.
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        hidden
        onChange={(e) => handleImages(e.target.files)}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        hidden
        onChange={(e) => handleVideo(e.target.files)}
      />

      <p className="text-xs text-muted-foreground">
        Up to {MAX_REVIEW_IMAGES} photos ({formatBytes(MAX_REVIEW_IMAGE_BYTES)} each) and one video
        ({formatBytes(MAX_REVIEW_VIDEO_BYTES)}). {imageUrls.length}/{MAX_REVIEW_IMAGES} added.
      </p>
    </div>
  );
}
