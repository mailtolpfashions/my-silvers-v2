import { Suspense } from "react";
import type { Metadata } from "next";
import { getFaqItems, getFaqIntro } from "@/server/cms/faq";
import { groupFaqItems } from "@/lib/faq";
import { Expandable } from "@/components/storefront/expandable";
import { RichText } from "@/components/storefront/cms/rich-text";
import { ContentGap } from "@/components/storefront/content-gap";
import { EmptyState } from "@/components/layout/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BreadcrumbJsonLd, FaqJsonLd } from "@/components/storefront/structured-data";

/**
 * The FAQ.
 *
 * ── Why a route of its own rather than a CMS `page` entry ────────────────────
 * A `page` entry is one rich-text blob. This needs the questions as structured
 * data — to group them, to collapse them, to emit FAQPage JSON-LD, and to feed
 * the subset that appears on every product page. All four need the questions to
 * be separate records rather than headings inside one document.
 *
 * ── Nothing here is invented ─────────────────────────────────────────────────
 * Every question and answer comes from the `faq` CMS singleton. When it is
 * unauthored this page says so and stops; it does not fall back to a written-in
 * answer about shipping or returns. See the note in product-info-sections.tsx —
 * an invented returns window in JSX is how the shop ends up contradicting
 * itself in two places.
 */
export const metadata: Metadata = {
  title: "Frequently asked questions",
  description:
    "Answers to common questions about ordering, delivery, returns, sizing and caring for sterling silver.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <div className="container-prose rhythm-commerce">
      <BreadcrumbJsonLd trail={[{ name: "FAQ", path: "/faq" }]} />
      <h1 className="text-h1">Frequently asked questions</h1>
      <Suspense fallback={<FaqSkeleton />}>
        <FaqBody />
      </Suspense>
    </div>
  );
}

async function FaqBody() {
  const [items, intro] = await Promise.all([getFaqItems(), getFaqIntro()]);
  const sections = groupFaqItems(items);

  if (sections.length === 0) {
    return (
      <>
        <ContentGap
          label="FAQ"
          detail="No published questions. The page renders an empty state for shoppers until questions are written and published — answers about delivery, returns and hallmarking are business claims and are not written in code."
          where="CMS → FAQ"
        />
        <EmptyState
          title="Nothing here yet"
          description="We're still writing these up. In the meantime, get in touch and we'll answer directly."
        />
      </>
    );
  }

  return (
    <>
      {/* Only the questions actually on this page are described to search
          engines — see the note on FaqJsonLd. */}
      <FaqJsonLd items={items} />

      {intro && (
        <p className="text-lead mt-4 border-b pb-6 text-muted-foreground">{intro}</p>
      )}

      <div className="mt-10 space-y-12">
        {sections.map((section) => (
          <section key={section.group}>
            <h2 className="label-eyebrow mb-1">{section.group}</h2>
            {/* The border-t belongs to the list, not the heading: Expandable
                draws its own border-b, so without this the first row of each
                group is missing its top rule. */}
            <div className="border-t">
              {section.items.map((item) => (
                <Expandable key={item.question} title={item.question}>
                  <RichText html={item.answer} className="prose-sm" />
                </Expandable>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/** Two groups of collapsed rows, matching the real page's geometry. */
function FaqSkeleton() {
  return (
    <div className="mt-10 space-y-12" aria-hidden>
      {Array.from({ length: 2 }, (_, section) => (
        <div key={section}>
          <Skeleton className="mb-3 h-3 w-40" />
          <div className="border-t">
            {Array.from({ length: 4 }, (_, row) => (
              <div key={row} className="h-[57px] border-b" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
