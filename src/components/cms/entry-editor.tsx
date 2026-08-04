"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldInput } from "@/components/cms/field-input";
import {
  saveEntryAction,
  publishEntryAction,
  unpublishEntryAction,
  deleteEntryAction,
  restoreVersionAction,
} from "@/actions/cms-actions";
import type { FieldDefinition, EntryData } from "@/server/cms/types";

export type VersionSummary = {
  id: string;
  versionNumber: number;
  label: string | null;
  savedAt: string;
};

export function EntryEditor({
  typeName,
  typeLabel,
  fields,
  entryId,
  initialData,
  initialSeo,
  status,
  versions,
  isAdmin,
}: {
  typeName: string;
  typeLabel: string;
  fields: FieldDefinition[];
  entryId: string | null;
  initialData: EntryData;
  initialSeo: {
    metaTitle: string;
    metaDescription: string;
    ogImage: string;
    canonicalUrl: string;
    noIndex: boolean;
  };
  status: "draft" | "published" | "archived" | null;
  versions: VersionSummary[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<EntryData>(initialData);
  const [seo, setSeo] = useState(initialSeo);
  const [currentId, setCurrentId] = useState(entryId);
  const [showPreview, setShowPreview] = useState(false);
  const [seoOpen, setSeoOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  /**
   * The storefront path this entry becomes once published.
   *
   * Used to keep the preview on the draft: navigating the pane to the entry's
   * own live URL — clicking the logo while previewing the homepage, say — would
   * quietly swap your unsaved draft for the published page. Returning null means
   * "this type has no page of its own" (hero slides, banners, announcements),
   * and nothing is intercepted.
   */
  const livePath = (() => {
    const slug = typeof data.slug === "string" ? data.slug : null;
    switch (typeName) {
      case "homepage":
        return "/";
      case "blog":
        return slug ? `/blog/${slug}` : null;
      case "page":
        return slug ? `/p/${slug}` : null;
      case "collection":
        return slug ? `/collections/${slug}` : null;
      default:
        return null;
    }
  })();

  // ── Live preview: debounced same-origin postMessage into the iframe.
  // 400ms matches the old Studio's cadence; origin checks are trivial now
  // that editor and preview share one origin.
  useEffect(() => {
    if (!showPreview) return;
    const timeout = setTimeout(() => {
      // Deliberately does NOT force the frame back to the preview route. You're
      // allowed to click through the pane to check a link, and yanking it back
      // mid-browse would make that impossible. If the frame has wandered off,
      // the message is simply ignored and the "Back to preview" button returns
      // it on demand.
      iframeRef.current?.contentWindow?.postMessage(
        { type: "cms-preview", contentType: typeName, data },
        window.location.origin
      );
    }, 400);
    return () => clearTimeout(timeout);
  }, [data, showPreview, typeName]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "cms-preview-ready" && showPreview) {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "cms-preview", contentType: typeName, data },
          window.location.origin
        );
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [data, showPreview, typeName]);

  async function save(): Promise<string | null> {
    const result = await saveEntryAction({ typeName, entryId: currentId, data, seo });
    if (!result.ok) {
      toast.error(result.error);
      return null;
    }
    if (result.entryId && result.entryId !== currentId) {
      setCurrentId(result.entryId);
      window.history.replaceState(null, "", `/cms/content/${typeName}/${result.entryId}`);
    }
    return result.entryId ?? currentId;
  }

  function handleSaveDraft() {
    startTransition(async () => {
      const id = await save();
      if (id) {
        toast.success("Draft saved.");
        router.refresh();
      }
    });
  }

  function handlePublish() {
    startTransition(async () => {
      const id = await save();
      if (!id) return;
      const result = await publishEntryAction(id, typeName);
      if (result.ok) {
        toast.success("Published!");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleUnpublish() {
    if (!currentId) return;
    startTransition(async () => {
      const result = await unpublishEntryAction(currentId, typeName);
      if (result.ok) {
        toast.success("Unpublished — the live version has been taken down.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDelete() {
    if (!currentId) return;
    if (!window.confirm("Delete this entry permanently?")) return;
    startTransition(async () => {
      const result = await deleteEntryAction(currentId, typeName);
      if (result.ok) {
        toast.success("Entry deleted.");
        router.push(`/cms/content/${typeName}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRestore(versionId: string) {
    if (!currentId) return;
    startTransition(async () => {
      const result = await restoreVersionAction(currentId, versionId, typeName);
      if (result.ok) {
        toast.success("Version restored as the working draft — reloading.");
        window.location.reload();
      } else {
        toast.error(result.error);
      }
    });
  }

  const seoField = (
    key: keyof typeof seo,
    label: string,
    textarea = false
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {textarea ? (
        <Textarea
          value={seo[key] as string}
          onChange={(e) => setSeo((s) => ({ ...s, [key]: e.target.value }))}
          rows={2}
        />
      ) : (
        <Input
          value={seo[key] as string}
          onChange={(e) => setSeo((s) => ({ ...s, [key]: e.target.value }))}
        />
      )}
    </div>
  );

  return (
    <div className={showPreview ? "grid gap-6 xl:grid-cols-2" : ""}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{typeLabel}</h1>
            <Badge variant={status === "published" ? "default" : "secondary"}>
              {status ?? "new"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview((p) => !p)}
              className="hidden xl:inline-flex"
            >
              {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showPreview ? "Hide preview" : "Preview"}
            </Button>
            <Button variant="outline" size="sm" disabled={isPending} onClick={handleSaveDraft}>
              Save draft
            </Button>
            <Button size="sm" disabled={isPending} onClick={handlePublish}>
              {status === "published" ? "Re-publish" : "Publish"}
            </Button>
            {isAdmin && status === "published" && (
              <Button variant="outline" size="sm" disabled={isPending} onClick={handleUnpublish}>
                Unpublish
              </Button>
            )}
            {isAdmin && currentId && (
              <Button variant="destructive" size="sm" disabled={isPending} onClick={handleDelete}>
                Delete
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={data[field.name]}
              onChange={(v) => setData((d) => ({ ...d, [field.name]: v }))}
            />
          ))}
        </div>

        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setSeoOpen((o) => !o)}
          >
            <CardTitle className="text-sm">SEO {seoOpen ? "▾" : "▸"}</CardTitle>
          </CardHeader>
          {seoOpen && (
            <CardContent className="space-y-4">
              {seoField("metaTitle", "Meta title")}
              {seoField("metaDescription", "Meta description", true)}
              {seoField("ogImage", "OG image URL")}
              {seoField("canonicalUrl", "Canonical URL")}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={seo.noIndex}
                  onChange={(e) => setSeo((s) => ({ ...s, noIndex: e.target.checked }))}
                />
                Hide from search engines (noindex)
              </label>
            </CardContent>
          )}
        </Card>

        {versions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Version history (last {versions.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {versions.map((version) => (
                <div key={version.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    v{version.versionNumber}
                    {version.label ? ` · ${version.label}` : ""} ·{" "}
                    {new Date(version.savedAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleRestore(version.id)}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {showPreview && (
        <div className="sticky top-6 hidden h-[calc(100vh-6rem)] flex-col gap-2 xl:flex">
          {/* Clicking through the pane is allowed, so there has to be a way
              home. location.replace rather than reassigning src: the src string
              is unchanged when you're already on a preview sub-path, and it
              keeps the frame's history from filling with preview entries. */}
          <div className="flex shrink-0 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                iframeRef.current?.contentWindow?.location.replace(`/preview/${typeName}`);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Back to preview
            </Button>
          </div>
          <iframe
            ref={iframeRef}
            src={`/preview/${typeName}`}
            className="h-full min-h-0 w-full flex-1 rounded-lg border bg-white"
            title="Live preview"
            // Belt and braces alongside the child's ready handshake: any load of
            // the frame gets the current draft pushed at it, so the pane can't
            // be left showing stale content if a message is missed.
            onLoad={() => {
              const frame = iframeRef.current;
              if (!frame) return;

              // Runs on EVERY navigation inside the pane, and from the parent —
              // which stays alive the whole time. That's what makes this work
              // for the full journey: browse to /products, click the logo, and
              // you land back on the draft rather than the published homepage.
              try {
                if (livePath && frame.contentWindow?.location.pathname === livePath) {
                  frame.contentWindow.location.replace(`/preview/${typeName}`);
                  return;
                }
              } catch {
                // Same-origin only; ignore and fall through to the post below.
              }

              frame.contentWindow?.postMessage(
                { type: "cms-preview", contentType: typeName, data },
                window.location.origin
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
