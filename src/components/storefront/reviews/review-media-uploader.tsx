"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { uploadToCloudinary } from "@/lib/cloudinary-upload";
import {
  MAX_REVIEW_IMAGE_BYTES,
  REVIEW_MEDIA_FOLDER,
  formatBytes,
} from "@/lib/review-media";

/**
 * The one photo a shopper may attach to a review.
 *
 * ⚠️  The size check in here is COURTESY, not security. It exists so someone on
 * a phone connection finds out a 200 MB file is too big before spending four
 * minutes uploading it — not to keep it out. Everything is re-checked against
 * Cloudinary at submit, in server/reviews/media.ts, and that check is the one
 * that decides. Changing a number here changes nothing about what the shop will
 * accept; change it in lib/review-media.ts, which both sides import.
 *
 * Uploads go straight from the browser to Cloudinary, as everywhere else in
 * this codebase — the bytes never pass through a Function.
 */
export function ReviewMediaUploader({
  imageUrl,
  onChange,
  disabled,
}: {
  imageUrl: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    if (file.size > MAX_REVIEW_IMAGE_BYTES) {
      toast.error(`Photos must be under ${formatBytes(MAX_REVIEW_IMAGE_BYTES)}.`);
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadToCloudinary(file, REVIEW_MEDIA_FOLDER);
      /**
       * The previous photo is NOT destroyed here. Swapping the picture twice
       * before pressing Post would otherwise delete a file the review still
       * points at if the submit then failed. upsertReview clears the old one
       * after the write succeeds, which is the only moment it is safe.
       */
      onChange(uploaded);
      toast.success(imageUrl ? "Photo replaced." : "Photo added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        Photo <span className="font-normal text-muted-foreground">(optional)</span>
      </p>

      <div className="flex flex-wrap items-start gap-3">
        {imageUrl ? (
          <div className="relative size-20 overflow-hidden rounded-md border">
            <Image src={imageUrl} alt="Your photo" fill sizes="80px" className="object-cover" />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(null)}
              aria-label="Remove photo"
              // Always visible rather than revealed on hover: this control gets
              // used on a phone as often as on a desktop, and there is no hover
              // there.
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            {uploading ? "Uploading" : "Add photo"}
          </button>
        )}

        {imageUrl && (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            className="text-sm underline underline-offset-4 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Replace"}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        // Kept in step with ALLOWED_REVIEW_IMAGE_FORMATS, which is what
        // Cloudinary actually enforces. A bare `image/*` would let a phone offer
        // formats the signature rejects, so the refusal would arrive after the
        // upload had finished rather than in the picker.
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        hidden
        onChange={(e) => handleFile(e.target.files)}
      />

      <p className="text-xs text-muted-foreground">
        One photo, up to {formatBytes(MAX_REVIEW_IMAGE_BYTES)}. Shoppers find a real photo of the
        piece more useful than anything else in a review.
      </p>
    </div>
  );
}
