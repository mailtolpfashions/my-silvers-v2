"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ImagePlus, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadProductImages } from "@/lib/cloudinary-upload";
import { readPhotoName } from "@/lib/photo-names";
import {
  attachProductPhotosAction,
  matchPhotoSkusAction,
  type PhotoMatch,
} from "@/actions/product-photo-actions";

/** Mirrors MAX_PHOTOS in actions/product-photo-actions.ts. */
const MAX_PHOTOS = 6;
/** Cloudinary's free plan refuses single images over 10 MB. */
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_EXT = /\.(jpe?g|png|webp|avif|heic)$/i;

type FileEntry = { file: File; preview: string };
type Group = {
  product: PhotoMatch;
  files: FileEntry[];
  status: "waiting" | "uploading" | "done" | "error";
  message?: string;
};

/**
 * Products → Bulk photos.
 *
 * Drop a folder of photos named by SKU; each is matched to its product, shown
 * in a preview, and on Save uploaded straight to Cloudinary under the shop's
 * naming (`<SKU>_1`, `_2`… in the category's folder — the same as the product
 * form) and attached in order. No URL is ever copied by hand.
 */
export function BulkPhotoUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [tooBig, setTooBig] = useState<string[]>([]);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [matching, setMatching] = useState(false);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Object URLs hold the image in memory until revoked — on leaving the page
  // only. Revoking on every change would blank the previews mid-upload, since
  // each status update makes a new `groups` array around the same files.
  const groupsRef = useRef(groups);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  useEffect(
    () => () => groupsRef.current.forEach((g) => g.files.forEach((f) => URL.revokeObjectURL(f.preview))),
    []
  );

  async function handleFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []).filter((f) => IMAGE_EXT.test(f.name) || f.type.startsWith("image/"));
    if (files.length === 0) {
      toast.error("No photos found — choose .jpg, .png or .webp files.");
      return;
    }
    setMatching(true);
    try {
      const big = files.filter((f) => f.size > MAX_BYTES);
      const usable = files.filter((f) => f.size <= MAX_BYTES);
      const readings = usable.map((file) => ({ file, ...readPhotoName(file.name) }));
      const candidates = readings.flatMap((r) => (r.stripped ? [r.whole, r.stripped] : [r.whole]));
      const result = await matchPhotoSkusAction(candidates);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const bySku = new Map<string, { product: PhotoMatch; items: Array<{ file: File; n: number }> }>();
      const missed: string[] = [];
      for (const r of readings) {
        const wholeHit = result.matches[r.whole.toLowerCase()];
        const strippedHit = r.stripped ? result.matches[r.stripped.toLowerCase()] : undefined;
        const product = wholeHit ?? strippedHit;
        if (!product) {
          missed.push(r.file.name);
          continue;
        }
        const n = wholeHit ? 0 : (r.n ?? 0);
        const entry = bySku.get(product.id) ?? { product, items: [] };
        entry.items.push({ file: r.file, n });
        bySku.set(product.id, entry);
      }

      groups.forEach((g) => g.files.forEach((f) => URL.revokeObjectURL(f.preview)));
      setGroups(
        [...bySku.values()]
          .sort((a, b) => a.product.sku.localeCompare(b.product.sku))
          .map(({ product, items }) => ({
            product,
            // Photo number first, then name — "_1" leads, and is the main photo.
            files: items
              .sort((a, b) => a.n - b.n || a.file.name.localeCompare(b.file.name))
              .map(({ file }) => ({ file, preview: URL.createObjectURL(file) })),
            status: "waiting" as const,
          }))
      );
      setUnmatched(missed);
      setTooBig(big.map((f) => f.name));
    } finally {
      setMatching(false);
    }
  }

  /** Photos a product would end up with, and whether that breaks the cap. */
  function outcome(g: Group) {
    const total = mode === "replace" ? g.files.length : g.product.images.length + g.files.length;
    return { total, over: total > MAX_PHOTOS };
  }

  const ready = groups.filter((g) => g.status !== "done" && !outcome(g).over);
  const photoCount = useMemo(() => groups.reduce((n, g) => n + g.files.length, 0), [groups]);

  function update(id: string, patch: Partial<Group>) {
    setGroups((gs) => gs.map((g) => (g.product.id === id ? { ...g, ...patch } : g)));
  }

  async function save() {
    setRunning(true);
    let done = 0;
    let failed = 0;
    // One product at a time: each signs its own consecutive SKU numbers, and a
    // phone on shop Wi-Fi uploading forty photos at once helps nobody.
    for (const g of ready) {
      update(g.product.id, { status: "uploading", message: undefined });
      const up = await uploadProductImages(
        g.files.map((f) => f.file),
        { sku: g.product.sku, categoryId: g.product.categoryId }
      );
      if (up.urls.length === 0) {
        failed++;
        update(g.product.id, { status: "error", message: up.error ?? "Upload failed." });
        continue;
      }
      const attached = await attachProductPhotosAction({ productId: g.product.id, urls: up.urls, mode });
      if (!attached.ok) {
        failed++;
        update(g.product.id, { status: "error", message: attached.error });
        continue;
      }
      done++;
      update(g.product.id, {
        status: up.error ? "error" : "done",
        message: up.error
          ? `${up.urls.length} of ${g.files.length} uploaded, then: ${up.error}`
          : `Now has ${attached.total} photo${attached.total === 1 ? "" : "s"}.`,
      });
    }
    setRunning(false);
    if (failed === 0) toast.success(`Photos added to ${done} product${done === 1 ? "" : "s"}.`);
    else toast.error(`${done} done, ${failed} need another try — see the list.`);
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center ${
          dragOver ? "border-foreground bg-muted" : "border-input"
        }`}
      >
        <ImagePlus className="size-8 text-muted-foreground" />
        <p className="text-sm">
          Drag photos here, or{" "}
          <button type="button" className="underline" onClick={() => inputRef.current?.click()}>
            choose files
          </button>
          .
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          Name each photo by its SKU: <code>MYS-RNG-001_1.jpg</code>, <code>MYS-RNG-001_2.jpg</code>…
          Windows&apos; rename (<code>MYS-RNG-001 (1).jpg</code>) works too. Photo 1 becomes the main
          photo.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {matching && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Matching to products…
          </p>
        )}
      </div>

      {(groups.length > 0 || unmatched.length > 0 || tooBig.length > 0) && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <strong>{photoCount}</strong> photo{photoCount === 1 ? "" : "s"} →{" "}
              <strong>{groups.length}</strong> product{groups.length === 1 ? "" : "s"}
              {unmatched.length > 0 && (
                <span className="text-destructive"> · {unmatched.length} didn&apos;t match a SKU</span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-sm" role="radiogroup" aria-label="Existing photos">
              <span className="text-muted-foreground">Existing photos:</span>
              {(
                [
                  ["add", "Keep, add after"],
                  ["replace", "Replace"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="photo-mode"
                    checked={mode === value}
                    disabled={running}
                    onChange={() => setMode(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <ul className="divide-y rounded-lg border">
            {groups.map((g) => {
              const { total, over } = outcome(g);
              return (
                <li key={g.product.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-48 flex-1">
                    <Link
                      href={`/admin/products/${g.product.id}`}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {g.product.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {g.product.sku} · has {g.product.images.length} now →{" "}
                      <span className={over ? "font-medium text-destructive" : ""}>
                        {total} after{over ? ` (most is ${MAX_PHOTOS})` : ""}
                      </span>
                    </p>
                    {g.message && (
                      <p className={`text-xs ${g.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                        {g.message}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {g.files.map((f, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:), not a hosted image
                      <img
                        key={f.preview}
                        src={f.preview}
                        alt={`${g.product.sku} photo ${i + 1}`}
                        title={f.file.name}
                        className="size-12 rounded border object-cover"
                      />
                    ))}
                  </div>
                  <span className="w-6">
                    {g.status === "uploading" && <Loader2 className="size-4 animate-spin" />}
                    {g.status === "done" && <CheckCircle2 className="size-4 text-green-700" />}
                    {g.status === "error" && <XCircle className="size-4 text-destructive" />}
                  </span>
                </li>
              );
            })}
          </ul>

          {unmatched.length > 0 && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm">
              <p className="font-medium text-destructive">No product has these SKUs — rename or skip them:</p>
              <p className="mt-1 break-all text-xs">{unmatched.join(", ")}</p>
            </div>
          )}
          {tooBig.length > 0 && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Over 10 MB, skipped (Cloudinary&apos;s limit) — resize and add again:</p>
              <p className="mt-1 break-all text-xs">{tooBig.join(", ")}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={running || ready.length === 0}>
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Uploading…
                </>
              ) : (
                `Upload and attach to ${ready.length} product${ready.length === 1 ? "" : "s"}`
              )}
            </Button>
            {!running && (
              <Button
                variant="ghost"
                onClick={() => {
                  setGroups([]);
                  setUnmatched([]);
                  setTooBig([]);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
