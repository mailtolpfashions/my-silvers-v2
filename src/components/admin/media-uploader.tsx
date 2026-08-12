"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { X, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadToCloudinary } from "@/lib/cloudinary-upload";

export function ImagesUploader({
  images,
  onChange,
  max = 6,
  folder = "mysilvers/products",
}: {
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
  folder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = max - images.length;
    const selected = Array.from(files).slice(0, room);
    if (selected.length === 0) {
      toast.error(`Maximum ${max} images.`);
      return;
    }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of selected) {
        urls.push(await uploadToCloudinary(file, folder));
      }
      onChange([...images, ...urls]);
      // Uploading only reported FAILURE before. A slow upload that worked
      // looked identical to one that had not started — the thumbnail appearing
      // was the only confirmation, and on a large file that is many seconds of
      // wondering.
      toast.success(
        urls.length === 1 ? "Image uploaded." : `${urls.length} images uploaded.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((url, i) => (
          <div key={url} className="group relative h-24 w-24 overflow-hidden rounded-md border">
            <Image src={url} alt={`Image ${i + 1}`} fill className="object-cover" sizes="96px" />
            <button
              type="button"
              onClick={() => onChange(images.filter((u) => u !== url))}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {images.length < max && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Add image"}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {images.length}/{max} images
      </p>
    </div>
  );
}

export function VideoUploader({
  videoUrl,
  onChange,
  folder = "mysilvers/products",
}: {
  videoUrl: string | null;
  onChange: (url: string | null) => void;
  folder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadToCloudinary(file, folder));
      toast.success("Video uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {videoUrl ? (
        <div className="space-y-2">
          <video src={videoUrl} controls className="max-h-48 rounded-md border" />
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
            Remove video
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Uploading…" : "Upload video"}
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => handleFile(e.target.files)}
      />
    </div>
  );
}
