"use client";

import { useEffect, useState, use } from "react";
import Image from "next/image";
import { HomepageView } from "@/components/storefront/cms/homepage-view";
import { CustomerReviewsPreviewNote } from "@/components/storefront/customer-reviews-note";
import { HeroCarousel } from "@/components/storefront/hero-carousel";
import { toHeroSlides } from "@/server/cms/hero-slides";
import { HomepageSection } from "@/components/storefront/homepage-section";
import type { HomepageSection as Section } from "@/server/products/homepage-sections";
import type { EntryData } from "@/server/cms/types";
// Pure helpers — no Prisma, no next/*, so the preview shares the exact grouping
// the /faq page uses. See the note on FaqPreview.
import { parseFaqItems, groupFaqItems } from "@/lib/faq";

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

    const announceReady = () =>
      window.parent.postMessage({ type: "cms-preview-ready" }, window.location.origin);

    /**
     * Re-announce on bfcache restore.
     *
     * Navigating inside the preview and coming back restores this page from the
     * back-forward cache — the component never remounts, so the mount-time
     * handshake never re-runs and the pane sits on whatever it last rendered.
     * That's the "my edits vanished" case.
     */
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) announceReady();
    }

    // Navigation inside the pane is deliberately allowed — clicking through to
    // check a link target is a normal thing to want. Those pages show PUBLISHED
    // content (only the homepage has a draft to render), and the editor offers a
    // "Back to preview" control to return here.
    window.addEventListener("message", onMessage);
    window.addEventListener("pageshow", onPageShow);
    announceReady();

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [type]);

  return (
    <div className="min-h-screen bg-background">
      {/* z-[100]: this bar is chrome ABOVE the rendered site, so it has to clear
          everything the storefront can stack — the sticky header sits at z-40,
          dialogs at z-50, and card badges and wishlist buttons at z-10, which
          were punching through it. */}
      <div className="sticky top-0 z-[100] flex items-center justify-between bg-foreground px-4 py-1.5 text-xs text-background">
        <span className="font-semibold uppercase tracking-wider">Preview — {type}</span>
        <span className="opacity-70">{data ? "Live" : "Waiting for editor…"}</span>
      </div>
      {data === null ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          Make a change in the editor to see it here.
        </p>
      ) : (
        <TypePreview type={type} data={data} />
      )}
    </div>
  );
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

/**
 * The homepage, rendered the way the storefront renders it.
 *
 * Hero slides and resolved sections both need the database, which draft form
 * data can't reach — so they're fetched from /api/cms/preview/homepage, which
 * calls exactly the same resolvers the real page does.
 */
function HomepagePreview({ data }: { data: EntryData }) {
  const [resolved, setResolved] = useState<{ sections: Section[] } | null>(null);

  useEffect(() => {
    // The editor pushes on every keystroke (debounced 400ms upstream); abort
    // in-flight resolves so a fast typist doesn't race stale responses onto
    // the screen.
    const controller = new AbortController();
    fetch("/api/cms/preview/homepage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => json && setResolved(json))
      .catch(() => {
        /* aborted or offline — keep showing the last good render */
      });
    return () => controller.abort();
  }, [data]);

  const heroSlides = toHeroSlides(data);

  /**
   * The shutter chain, computed exactly as (storefront)/page.tsx does.
   *
   * Duplicated rather than shared because the two callers reach the sections by
   * different routes — the storefront awaits the resolver on the server, this
   * pane fetches already-resolved JSON — but the RULE has to stay identical or
   * the preview stops showing editors what they are about to publish. If this
   * gains a third caller, lift it into homepage-sections.ts rather than copying
   * it again. See the note there for why the chain must be leading and
   * contiguous, and why it needs a full-bleed hero above it.
   */
  const revealDepths = new Map<string, number>();
  if (heroSlides.length > 0) {
    for (const [i, section] of (resolved?.sections ?? []).entries()) {
      if (!("pinnedReveal" in section) || !section.pinnedReveal) break;
      revealDepths.set(section.key, i);
    }
  }

  return (
    <>
      {/* Slides come straight off the draft, so the hero updates as you type. */}
      <HomepageView data={data} heroSlides={heroSlides} />

      {/*
        ⚠️  MUST mirror (storefront)/page.tsx: everything below the hero goes in
        ONE .page-over-hero wrapper, as a direct sibling of the hero.

        Below 1024px .hero-curtain becomes `position: sticky`, and the only
        thing that covers it is the `.hero-curtain ~ .page-over-hero` rule in
        globals.css — an opaque sheet at z-index 1. The sections cannot provide
        that themselves: each is a .reveal-section starting at `opacity: 0`, and
        opacity applies to an element's own background too.

        This pane had the hero and the sections as bare siblings with no
        wrapper, so the rule never matched. Media queries inside an iframe
        resolve against the IFRAME's width, and the preview pane is well under
        1024px even on a wide monitor — so the preview always took the sticky
        path and always showed the hero through every section, while the real
        page at the same window width did not. Exactly the symptom the
        globals.css note predicts.
      */}
      <div className="page-over-hero">
        {resolved?.sections.map((section) => (
          <HomepageSection
            key={section.key}
            section={section}
            revealDepth={revealDepths.get(section.key)}
            // The real feed is an async server component and can't render here;
            // the placeholder keeps the section's position in the page visible.
            instagramSlot={
              section.kind === "instagram" ? (
                <div className="container-page py-16 text-center text-sm text-muted-foreground">
                  Instagram feed — renders live on the published page.
                </div>
              ) : undefined
            }
          />
        ))}
        {resolved === null && (
          <p className="py-10 text-center text-xs text-muted-foreground">Resolving sections…</p>
        )}
        {/* Matches the real page: after the sections, not under the hero. */}
        <CustomerReviewsPreviewNote />
      </div>
    </>
  );
}

/**
 * Renders the draft using the SAME components the storefront uses, so what an
 * editor sees is what ships.
 *
 * Only `homepage` used to get a real render; every other type fell through to a
 * field dump, which showed an editor their labels and values rather than their
 * page. GenericPreview is still the fallback for types with no bespoke render
 * (and for any content type added later), but it is now the exception.
 */
function TypePreview({ type, data }: { type: string; data: EntryData }) {
  switch (type) {
    case "homepage":
      return <HomepagePreview data={data} />;

    case "heroSlide": {
      // The carousel needs a headline; without one there is nothing to show.
      const headline = str(data.headline);
      if (!headline) {
        return <PreviewEmpty message="Add a headline to preview this slide." />;
      }
      const overlay = Number(data.overlayOpacity);
      return (
        <HeroCarousel
          slides={[
            {
              id: "preview",
              eyebrow: str(data.eyebrow),
              headline,
              subline: str(data.subline),
              ctaLabel: str(data.ctaLabel),
              ctaHref: str(data.ctaHref),
              secondaryLabel: str(data.secondaryLabel),
              secondaryHref: str(data.secondaryHref),
              media: str(data.media),
              overlayOpacity: Number.isFinite(overlay)
                ? Math.min(100, Math.max(0, overlay))
                : undefined,
              // Same fallback as toHeroSlides, so a preview shows the header
              // the way the live page will render it.
              headerTone: str(data.headerTone) === "dark" ? "dark" : "light",
            },
          ]}
        />
      );
    }

    case "announcement": {
      const text = str(data.text);
      if (!text) return <PreviewEmpty message="Add announcement text to preview it." />;
      const tone = str(data.tone) ?? "neutral";
      const toneClass =
        {
          neutral: "bg-black text-white",
          sale: "bg-black text-white",
          info: "bg-half-white text-half-black",
          alert: "bg-destructive text-white",
        }[tone] ?? "bg-black text-white";
      return (
        <div className={`px-4 py-2 text-center text-sm ${toneClass}`}>
          <span className="font-medium">{text}</span>
          {str(data.subtext) && <span className="ml-2 opacity-80">{str(data.subtext)}</span>}
          {str(data.cta) && <span className="ml-2 underline">{str(data.cta)}</span>}
        </div>
      );
    }

    case "banner": {
      const image = str(data.image);
      if (!image) return <PreviewEmpty message="Add an image to preview this banner." />;
      return (
        <div className="container-page py-8">
          <div className="relative aspect-[16/5] w-full overflow-hidden rounded-lg bg-muted">
            <Image src={image} alt="" fill className="object-cover" sizes="100vw" />
            {str(data.title) && (
              <>
                <div className="absolute inset-0 bg-gradient-to-r from-black/55 to-transparent" />
                <div className="absolute inset-y-0 left-0 flex max-w-md flex-col justify-center p-6 sm:p-10">
                  <p className="font-heading text-h2 text-white">{str(data.title)}</p>
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    case "collection": {
      const title = str(data.title);
      if (!title) return <PreviewEmpty message="Add a title to preview this collection." />;
      return (
        <div>
          {str(data.heroImage) && (
            <div className="relative aspect-[16/5] w-full overflow-hidden bg-muted">
              <Image src={str(data.heroImage)!} alt="" fill className="object-cover" sizes="100vw" />
            </div>
          )}
          <div className="container-prose py-12 text-center">
            {str(data.eyebrow) && <p className="label-eyebrow">{str(data.eyebrow)}</p>}
            <h1 className="mt-3 text-h1">{title}</h1>
            {str(data.description) && (
              <p className="mt-4 text-muted-foreground">{str(data.description)}</p>
            )}
          </div>
          {str(data.story) && <DraftHtml html={str(data.story)!} />}
          {str(data.productTag) && (
            <p className="container-page pb-12 text-center text-sm text-muted-foreground">
              Products tagged <strong>{str(data.productTag)}</strong> appear here on the live page.
            </p>
          )}
        </div>
      );
    }

    // Both render as a single article — same shape, different field names.
    case "blog":
    case "page": {
      const title = str(data.title);
      if (!title) return <PreviewEmpty message="Add a title to preview this page." />;
      const cover = str(data.coverImage);
      const body = str(data.body) ?? str(data.content);
      return (
        <article className="container-prose py-10">
          <h1 className="text-h1">{title}</h1>
          {str(data.author) && (
            <p className="mt-2 text-sm text-muted-foreground">By {str(data.author)}</p>
          )}
          {str(data.excerpt) && <p className="mt-3 text-muted-foreground">{str(data.excerpt)}</p>}
          {cover && (
            <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-lg bg-muted">
              <Image src={cover} alt="" fill className="object-cover" sizes="672px" />
            </div>
          )}
          {body && <DraftHtml html={body} />}
        </article>
      );
    }

    case "faq":
      return <FaqPreview data={data} />;

    case "product-info":
      return <ProductInfoPreview data={data} />;

    default:
      return <GenericPreview data={data} />;
  }
}

/**
 * The FAQ, grouped exactly as /faq groups it.
 *
 * Reuses parseFaqItems and groupFaqItems rather than re-deriving the grouping —
 * they are deliberately free of Prisma and next/* imports so this client
 * component can share them, which is what keeps the preview honest. A grouping
 * rule reimplemented here would drift from the page it claims to preview.
 *
 * Rows render OPEN, unlike the storefront's collapsed accordion: an editor is
 * checking the answers they just typed, and a preview that hides all of them
 * behind twelve clicks shows nothing worth looking at.
 */
function FaqPreview({ data }: { data: EntryData }) {
  const items = parseFaqItems(data.items);
  if (items.length === 0) {
    return <PreviewEmpty message="Add a question with both a question and an answer to preview the FAQ." />;
  }

  const sections = groupFaqItems(items);
  const intro = str(data.intro);

  return (
    <div className="container-prose py-10">
      <h1 className="text-h1">Frequently asked questions</h1>
      {intro && <p className="text-lead mt-4 border-b pb-6 text-muted-foreground">{intro}</p>}

      <div className="mt-10 space-y-12">
        {sections.map((section) => (
          <section key={section.group}>
            <h2 className="label-eyebrow mb-1">{section.group}</h2>
            <div className="border-t">
              {section.items.map((item) => (
                <div key={item.question} className="border-b py-4">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-sm font-medium">{item.question}</h3>
                    {/* The flag is invisible on /faq itself, so the preview is
                        the only place an editor can check it without opening
                        a product page. */}
                    {item.showOnProductPage && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        also on product pages
                      </span>
                    )}
                  </div>
                  <DraftHtml html={item.answer} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * The three shared blocks that appear under every product's actions.
 *
 * Drawn as the storefront's expandable rows, open — same reason as the FAQ
 * above. "Details & measurements" is absent because it is per-product and comes
 * from the Product row, not from this entry; showing an empty one here would
 * suggest it is editable in the CMS.
 */
function ProductInfoPreview({ data }: { data: EntryData }) {
  const rows: Array<[string, string | undefined]> = [
    ["Materials & hallmarking", str(data.materials)],
    ["Care", str(data.care)],
    ["Shipping & returns", str(data.shippingReturns)],
  ];
  const written = rows.filter(([, html]) => html);

  if (written.length === 0) {
    return <PreviewEmpty message="Write one of these sections to preview it." />;
  }

  return (
    <div className="container-prose py-10">
      <p className="label-eyebrow mb-5">Shown on every product page</p>
      <div className="border-t">
        {rows.map(([title, html]) => (
          <div key={title} className="border-b py-4">
            <h3 className="text-sm font-medium">{title}</h3>
            {html ? (
              <DraftHtml html={html} />
            ) : (
              // Named rather than skipped: an editor needs to see which of the
              // three is still empty, because the storefront renders nothing
              // at all for an unwritten one.
              <p className="mt-2 text-sm italic text-muted-foreground">
                Not written yet — nothing renders for shoppers.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Draft rich text, rendered unsanitized on purpose — see the note at the top of
 * this file. This is the author's own in-memory draft; both the write path and
 * the published render path sanitize.
 */
function DraftHtml({ html }: { html: string }) {
  return (
    <div
      className="prose prose-sm container-prose max-w-none py-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function PreviewEmpty({ message }: { message: string }) {
  return <p className="py-24 text-center text-sm text-muted-foreground">{message}</p>;
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
        className="prose prose-sm max-w-none"
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
