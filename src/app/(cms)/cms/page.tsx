import { prisma } from "@/server/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";

/**
 * Blocking, like every other admin and CMS route — the reasoning is set out in
 * full in admin/reviews/page.tsx. In short: this is behind a login, opened by
 * staff a handful of times a day, and the three counts ARE the page, so there
 * is no shell worth prerendering and a skeleton would be replaced wholesale a
 * moment later.
 *
 * ⚠️  This route was one of two missing the export — exactly the oversight the
 * admin dashboard's note warns about. Validation is dev-only at the framework's
 * default warning level, so `next build` passed either way and the only signal
 * was an overlay error in dev:
 *
 *   Route "/cms": Next.js encountered uncached data during prerendering …
 *   `fetch(...)` or `connection()` accessed outside of <Suspense>
 *
 * Streaming the counts behind <Suspense> would also silence it, and would be
 * the wrong fix here: it buys a flash of three empty cards on a page nobody is
 * deciding anything from.
 */
export const instant = false;

export default async function CmsDashboardPage() {
  const [entryCount, publishedCount, mediaCount] = await Promise.all([
    prisma.contentEntry.count(),
    prisma.contentEntry.count({ where: { status: "published" } }),
    prisma.mediaAsset.count(),
  ]);

  const stats = [
    { label: "Total entries", value: entryCount },
    { label: "Published", value: publishedCount },
    { label: "Media files", value: mediaCount },
  ];

  return (
    <div>
      <PageHeader
        title="Studio"
        description="Everything the storefront reads its words and pictures from. Changes are saved as drafts and only go live when published."
      />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-h1 font-semibold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        The schema-driven content editor, media library, and live preview ship in Phase 4.
      </p>
    </div>
  );
}
