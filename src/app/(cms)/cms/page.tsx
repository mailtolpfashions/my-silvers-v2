import { prisma } from "@/server/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";

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
