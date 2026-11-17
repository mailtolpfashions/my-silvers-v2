import Link from "next/link";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/layout/page-header";
import { entryTitle } from "@/lib/cms-entry-title";
import { sortContentTypes } from "@/lib/cms-type-order";

/**
 * Blocking, like every other admin and CMS route — the reasoning is set out in
 * full in admin/reviews/page.tsx. In short: this is behind a login, opened by
 * staff a handful of times a day, and there is no shell worth prerendering.
 *
 * ⚠️  Keep the export: without it, dev throws "Next.js encountered uncached
 * data during prerendering" for this route (`next build` passes regardless).
 */
export const instant = false;

/**
 * Studio's start page: where to go, and what's waiting.
 *
 * It used to be three bare counts and a leftover "ships in Phase 4" note. Now:
 * every content type with its counts (one click into each), drafts that are
 * not live yet, and what was edited last — the three questions someone opening
 * the Studio actually has.
 */
export default async function CmsDashboardPage() {
  const [types, counts, drafts, recent, mediaCount] = await Promise.all([
    prisma.contentType.findMany({ select: { id: true, name: true, label: true, isSingleton: true } }),
    prisma.contentEntry.groupBy({ by: ["contentTypeId", "status"], _count: { _all: true } }),
    prisma.contentEntry.findMany({
      where: { status: "draft" },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, slug: true, data: true, updatedAt: true, contentType: { select: { name: true, label: true } } },
    }),
    prisma.contentEntry.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        slug: true,
        data: true,
        status: true,
        updatedAt: true,
        contentType: { select: { name: true, label: true } },
      },
    }),
    prisma.mediaAsset.count(),
  ]);

  const countOf = (typeId: string, status?: string) =>
    counts
      .filter((c) => c.contentTypeId === typeId && (!status || c.status === status))
      .reduce((n, c) => n + c._count._all, 0);
  /** A single-page type's only entry is named by its slug ("homepage") — show the type's name instead. */
  const nameOf = (e: { slug: string; data: unknown; contentType: { label: string } }) => {
    const t = entryTitle(e);
    return t === e.slug ? e.contentType.label : t;
  };
  const when = (d: Date) =>
    d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

  return (
    <div className="max-w-6xl space-y-8">
      <PageHeader
        title="Studio"
        description="Where the storefront's words and pictures come from — edits stay drafts until published."
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold">Content</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sortContentTypes(types).map((t) => {
            const total = countOf(t.id);
            const draft = countOf(t.id, "draft");
            return (
              <Link
                key={t.id}
                href={`/cms/content/${t.name}`}
                className="rounded-lg border bg-background p-4 transition-colors hover:border-foreground/40"
              >
                <p className="text-sm font-medium">{t.label}</p>
                <p className="mt-1 text-2xl font-semibold">{total}</p>
                <p className={`text-xs ${draft > 0 ? "text-[var(--state-warning-fg)]" : "text-muted-foreground"}`}>
                  {draft > 0 ? `${draft} draft${draft === 1 ? "" : "s"}` : t.isSingleton ? "Single page" : "All published"}
                </p>
              </Link>
            );
          })}
          <Link
            href="/cms/media"
            className="rounded-lg border bg-background p-4 transition-colors hover:border-foreground/40"
          >
            <p className="text-sm font-medium">Media</p>
            <p className="mt-1 text-2xl font-semibold">{mediaCount}</p>
            <p className="text-xs text-muted-foreground">Images and videos</p>
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <EntryList
          title="Drafts — not live yet"
          empty="Nothing waiting — every entry is published."
          rows={drafts.map((e) => ({
            href: `/cms/content/${e.contentType.name}/${e.id}`,
            title: nameOf(e),
            meta: `${e.contentType.label} · edited ${when(e.updatedAt)}`,
            status: "draft",
          }))}
        />
        <EntryList
          title="Recently edited"
          empty="No content yet."
          rows={recent.map((e) => ({
            href: `/cms/content/${e.contentType.name}/${e.id}`,
            title: nameOf(e),
            meta: `${e.contentType.label} · ${when(e.updatedAt)}`,
            status: e.status,
          }))}
        />
      </div>
    </div>
  );
}

function EntryList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ href: string; title: string; meta: string; status: string }>;
}) {
  return (
    <section className="rounded-lg border bg-background">
      <h2 className="border-b px-4 py-3 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.meta}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                    r.status === "published" ? "text-[var(--state-success-fg)]" : "text-[var(--state-warning-fg)]"
                  }`}
                >
                  {r.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
