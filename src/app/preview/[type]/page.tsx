"use client";

import { useEffect, useState, use } from "react";
import Image from "next/image";
import { HomepageView } from "@/components/storefront/cms/homepage-view";
import type { EntryData } from "@/server/cms/types";

/**
 * Live-preview render target, loaded in an iframe beside the entry editor.
 * Same-origin postMessage: the editor pushes draft form data here (debounced
 * 400ms), and this page signals readiness on mount. Draft HTML is rendered
 * without re-sanitization — it's the author's own in-memory draft (self-XSS
 * only); the write path and the published render path both sanitize.
 */
export default function PreviewPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = use(params);
  const [data, setData] = useState<EntryData | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "cms-preview" && event.data.contentType === type) {
        setData(event.data.data as EntryData);
      }
    }
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "cms-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [type]);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-foreground px-4 py-1.5 text-xs text-background">
        <span className="font-semibold uppercase tracking-wider">Preview — {type}</span>
        <span className="opacity-70">{data ? "Live" : "Waiting for editor…"}</span>
      </div>
      {data === null ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          Make a change in the editor to see it here.
        </p>
      ) : type === "homepage" ? (
        <HomepageView data={data} />
      ) : (
        <GenericPreview data={data} />
      )}
    </div>
  );
}

function isImageUrl(v: unknown): v is string {
  return typeof v === "string" && /^https:\/\/res\.cloudinary\.com\//.test(v);
}

function GenericPreview({ data }: { data: EntryData }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="rounded-lg border p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {key}
          </p>
          <PreviewValue value={value} />
        </div>
      ))}
      {Object.keys(data).length === 0 && (
        <p className="text-center text-sm text-muted-foreground">No content yet.</p>
      )}
    </div>
  );
}

function PreviewValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <p className="text-sm text-muted-foreground">—</p>;
  }
  if (typeof value === "boolean") {
    return <p className="text-sm">{value ? "Yes" : "No"}</p>;
  }
  if (isImageUrl(value)) {
    return (
      <div className="relative h-40 w-full max-w-sm overflow-hidden rounded-md">
        <Image src={value} alt="" fill className="object-cover" sizes="400px" />
      </div>
    );
  }
  if (typeof value === "string" && value.trimStart().startsWith("<")) {
    return (
      <div
        className="prose prose-sm max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="h-5 w-5 rounded border" style={{ backgroundColor: value }} />
        {value}
      </span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="rounded border bg-muted/30 p-2">
            {typeof item === "object" && item !== null ? (
              Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                <p key={k} className="text-sm">
                  <span className="text-muted-foreground">{k}: </span>
                  {typeof v === "string" || typeof v === "number" ? String(v) : "…"}
                </p>
              ))
            ) : (
              <p className="text-sm">{String(item)}</p>
            )}
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <pre className="overflow-x-auto rounded bg-muted/30 p-2 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <p className="text-sm">{String(value)}</p>;
}
