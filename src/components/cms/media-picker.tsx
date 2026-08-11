"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Upload, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadToCloudinaryDetailed } from "@/lib/cloudinary-upload";
import { recordMediaAssetAction } from "@/actions/cms-actions";

export type MediaAssetSummary = {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  alt: string | null;
};

/**
 * Media library picker used from image-type entry fields AND the rich-text
 * editor's image button (replacing the old Studio's raw window.prompt).
 */
export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
  accept = "image",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: MediaAssetSummary) => void;
  /**
   * "image" (default) hides video, because most consumers render through
   * next/image, which cannot display a video URL. "media" allows both, for the
   * hero slide — the one renderer that handles either.
   */
  accept?: "image" | "media";
}) {
  const allowsVideo = accept === "media";
  // null = not yet loaded (shows the loading state)
  const [assets, setAssets] = useState<MediaAssetSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const loading = assets === null;

  const load = useCallback(async (query: string) => {
    try {
      const res = await fetch(`/api/cms/media?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setAssets(data.assets ?? []);
    } catch {
      toast.error("Could not load the media library.");
      setAssets([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/cms/media?q=`);
        const data = await res.json();
        if (alive) setAssets(data.assets ?? []);
      } catch {
        if (alive) setAssets([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  async function handleUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadToCloudinaryDetailed(file, "mysilvers/cms");
      const result = await recordMediaAssetAction({
        url: uploaded.url,
        publicId: uploaded.publicId,
        originalName: uploaded.originalFilename,
        mimeType: file.type || `${uploaded.resourceType}/${uploaded.format ?? "bin"}`,
        size: uploaded.bytes,
        width: uploaded.width,
        height: uploaded.height,
        format: uploaded.format,
        folder: "cms",
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await load(q);
      toast.success("Uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              load(q);
            }}
          >
            <Input
              placeholder="Search media…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
          <Button
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={allowsVideo ? "image/*,video/*" : "image/*"}
            hidden
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>

        <div className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
          {loading || assets === null ? (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : assets.length === 0 ? (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No media yet — upload something.
            </p>
          ) : (
            assets
              .filter(
                (a) =>
                  a.mimeType.startsWith("image/") ||
                  (allowsVideo && a.mimeType.startsWith("video/"))
              )
              .map((asset) => {
                const isVideo = asset.mimeType.startsWith("video/");
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      onSelect(asset);
                      onOpenChange(false);
                    }}
                    className="group relative aspect-square overflow-hidden rounded-md border hover:ring-2 hover:ring-primary"
                  >
                    {isVideo ? (
                      <>
                        {/* metadata only — a library of autoloading videos
                            would download every clip just to open the picker. */}
                        <video
                          src={asset.url}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full bg-black object-cover"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <Play className="size-5 fill-white text-white" aria-hidden />
                        </span>
                      </>
                    ) : (
                      <Image
                        src={asset.url}
                        alt={asset.alt ?? asset.originalName}
                        fill
                        className="object-cover"
                        sizes="150px"
                      />
                    )}
                  </button>
                );
              })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
