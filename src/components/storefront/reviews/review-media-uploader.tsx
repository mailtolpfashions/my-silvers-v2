"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Item } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
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
 *
 * ── Why the drop zone is wide and short ─────────────────────────────────────
 * This was an 80px dashed square, which was easy to scroll straight past. A
 * customer's photo is the most persuasive thing on a review card, so the
 * control that produces one should be worth noticing.
 *
 * It is NOT the `aspect-square` zone the pattern it borrows from uses, though.
 * Square means "as tall as the card is wide" — about 350px here, in a dialog
 * that already carries a rating, a title, a textarea and a submit button. That
 * pushes the submit below the fold on a phone, and makes an optional photo look
 * required. Wide and short is the compromise: prominent, still clearly
 * secondary to the words.
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
  const inputId = useId();
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

  const busy = disabled || uploading;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        Photo <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>

      {imageUrl ? (
        <div className="relative h-32 w-full overflow-hidden rounded-md border">
          {/* The stored photo, shown at the same height the empty zone occupies
              so the dialog does not jump when one replaces the other. */}
          <Image src={imageUrl} alt="Your photo" fill sizes="400px" className="object-cover" />
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange(null)}
            aria-label="Remove photo"
            className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        /**
         * A real <button>, not the pattern's `<label role="button" tabindex=0>`.
         *
         * ⚠️  A focusable <label> is a trap: browsers open the file picker on
         * CLICK, but pressing Enter on a focused label does nothing in most of
         * them. That markup only stays usable because its input is `sr-only`
         * and therefore still tabbable — the label is decoration with a role
         * attribute on it. A button that calls .click() is honest about what it
         * is and works from the keyboard by default.
         */
        <Item asChild variant="outline" className="h-32 p-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            ) : (
              <ImageIcon className="size-8 text-muted-foreground/50" aria-hidden />
            )}
            <span className="text-sm text-muted-foreground">
              {uploading ? "Uploading…" : "Add a photo"}
            </span>
          </button>
        </Item>
      )}

      <input
        ref={inputRef}
        id={inputId}
        // Kept in step with ALLOWED_REVIEW_IMAGE_FORMATS, which is what
        // Cloudinary actually enforces. A bare `image/*` would let a phone offer
        // formats the signature rejects, so the refusal would arrive after the
        // upload had finished rather than in the picker.
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        hidden
        onChange={(e) => handleFile(e.target.files)}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          One photo, up to {formatBytes(MAX_REVIEW_IMAGE_BYTES)}.
        </p>
        {imageUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="text-xs underline underline-offset-4 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Replace"}
          </button>
        )}
      </div>
    </div>
  );
}
