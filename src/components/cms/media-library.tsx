"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Upload, Loader2, Film } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadToCloudinaryDetailed } from "@/lib/cloudinary-upload";
import {
  recordMediaAssetAction,
  updateMediaAssetAction,
  deleteMediaAssetsAction,
} from "@/actions/cms-actions";

export type MediaRow = {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  size: number;
  alt: string | null;
  tags: string[];
  folder: string;
  createdAt: string;
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function AssetDetailDialog({
  asset,
  onClose,
}: {
  asset: MediaRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [alt, setAlt] = useState(asset.alt ?? "");
  const [tags, setTags] = useState(asset.tags.join(", "));
  const [isPending, startTransition] = useTransition();

  function saveMeta() {
    startTransition(async () => {
      await updateMediaAssetAction(asset.id, {
        alt,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      toast.success("Saved.");
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate">{asset.originalName}</DialogTitle>
        </DialogHeader>
        {asset.mimeType.startsWith("image/") ? (
          <div className="relative h-48 overflow-hidden rounded-md bg-muted">
            <Image src={asset.url} alt={asset.alt ?? ""} fill className="object-contain" />
          </div>
        ) : (
          <video src={asset.url} controls className="max-h-48 rounded-md" />
        )}
        <p className="text-xs text-muted-foreground">
          {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}
          {formatBytes(asset.size)} · {asset.folder} ·{" "}
          {new Date(asset.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
        </p>
        <div className="space-y-1.5">
          <Label>Alt text</Label>
          <Input value={alt} onChange={(e) => setAlt(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Tags (comma-separated)</Label>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <div className="flex justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(asset.url);
              toast.success("URL copied.");
            }}
          >
            Copy URL
          </Button>
          <Button size="sm" disabled={isPending} onClick={saveMeta}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MediaLibrary({
  assets,
  folders,
  total,
  currentFolder,
  currentQuery,
}: {
  assets: MediaRow[];
  folders: string[];
  total: number;
  currentFolder?: string;
  currentQuery?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(currentQuery ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<MediaRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  function toggleSelect(id: string, additive: boolean) {
    setSelected((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (prev.has(id) && additive) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
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
        if (!result.ok) toast.error(result.error);
      }
      toast.success("Upload complete.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function deleteSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} file(s)? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await deleteMediaAssetsAction([...selected]);
      toast.success(`Deleted ${result.deleted} file(s).`);
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="min-w-48 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            updateParam("q", q || null);
          }}
        >
          <Input placeholder="Search media…" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <Button variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => handleUpload(e.target.files)}
        />
        {selected.size > 0 && (
          <Button variant="destructive" disabled={isPending} onClick={deleteSelected}>
            Delete ({selected.size})
          </Button>
        )}
      </div>

      {folders.length > 1 && (
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => updateParam("folder", null)}
            className={`rounded-md px-3 py-1.5 ${!currentFolder ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"}`}
          >
            All
          </button>
          {folders.map((folder) => (
            <button
              key={folder}
              onClick={() => updateParam("folder", folder)}
              className={`rounded-md px-3 py-1.5 ${currentFolder === folder ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              {folder}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">{total} files</p>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.shiftKey) {
                toggleSelect(asset.id, true);
              } else if (selected.size > 0) {
                toggleSelect(asset.id, true);
              } else {
                setDetail(asset);
              }
            }}
            className={`group relative aspect-square overflow-hidden rounded-md border ${
              selected.has(asset.id) ? "ring-2 ring-primary" : ""
            }`}
            title={asset.originalName}
          >
            {asset.mimeType.startsWith("image/") ? (
              <Image
                src={asset.url}
                alt={asset.alt ?? asset.originalName}
                fill
                className="object-cover"
                sizes="160px"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-muted">
                <Film className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </button>
        ))}
        {assets.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
            No media yet — upload your first file.
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Click to view/edit · Ctrl/Shift-click to multi-select for deletion
      </p>

      {detail && <AssetDetailDialog asset={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
