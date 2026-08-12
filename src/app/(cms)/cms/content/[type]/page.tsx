import Link from "next/link";
import { notFound } from "next/navigation";
import { listEntries, getSingletonEntry, CmsError } from "@/server/cms/entries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SearchParams = Promise<{ status?: string; q?: string; page?: string }>;

export default async function ContentListPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: SearchParams;
}) {
  const { type: typeName } = await params;
  const sp = await searchParams;

  let result;
  try {
    result = await listEntries({
      typeName,
      status: sp.status as "draft" | "published" | "archived" | undefined,
      q: sp.q,
      page: sp.page ? Number(sp.page) || 1 : 1,
    });
  } catch (err) {
    if (err instanceof CmsError) notFound();
    throw err;
  }
  const { type, entries, total } = result;

  // Singletons get a single edit card, not a table.
  if (type.isSingleton) {
    const entry = await getSingletonEntry(typeName);
    return (
      <div className="space-y-6">
        <PageHeader title={type.label} />
        <div className="rounded-lg border p-6">
          {entry ? (
            <div className="flex items-center justify-between">
              <div>
                <Badge variant={entry.status === "published" ? "default" : "secondary"}>
                  {entry.status}
                </Badge>
                <p className="mt-2 text-sm text-muted-foreground">
                  Last updated{" "}
                  {entry.updatedAt.toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <Button asChild>
                <Link href={`/cms/content/${typeName}/${entry.id}`}>Edit {type.label}</Link>
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <p className="mb-4 text-sm text-muted-foreground">
                No {type.label.toLowerCase()} content yet.
              </p>
              <Button asChild>
                <Link href={`/cms/content/${typeName}/new`}>Create {type.label}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={type.label}
        actions={
          <Button asChild size="sm">
            <Link href={`/cms/content/${typeName}/new`}>New entry</Link>
          </Button>
        }
      />

      <div className="flex gap-2 text-sm">
        {[
          [undefined, "All"],
          ["published", "Published"],
          ["draft", "Drafts"],
        ].map(([value, label]) => (
          <Link
            key={label}
            href={value ? `?status=${value}` : "?"}
            className={`rounded-md px-3 py-1.5 ${
              sp.status === value || (!sp.status && !value)
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {label}
          </Link>
        ))}
        <span className="ml-auto self-center text-muted-foreground">{total} entries</span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                {/* Title first, slug beneath. The list used to show only the
                    slug, so an editor scanning for "The Gifting Guide" had to
                    read "gifting-guide-silver" and translate. */}
                <TableCell className="text-sm">
                  <span className="font-medium">{entryTitle(entry)}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {entry.slug}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={entry.status === "published" ? "default" : "secondary"}>
                    {entry.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {entry.updatedAt.toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/cms/content/${typeName}/${entry.id}`}>Edit</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="p-0">
                  {/* `status` is the only filter this list has, so it is the
                      only thing that can produce an empty result other than
                      there being nothing at all. */}
                  {sp.status ? (
                    <EmptyState
                      title={`No ${sp.status} ${type.label.toLowerCase()}`}
                      description="Nothing here with that status yet."
                      action={
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/cms/content/${typeName}`}>Show all</Link>
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      title={`No ${type.label.toLowerCase()} yet`}
                      description="Create the first entry — it saves as a draft, so nothing goes live until you publish it."
                      action={
                        <Button asChild size="sm">
                          <Link href={`/cms/content/${typeName}/new`}>New entry</Link>
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * A human label for an entry row.
 *
 * Content types don't agree on which field is the name — blog/page/collection
 * use `title`, announcements use `text`, banners use `title`. Try the likely
 * ones in order and fall back to the slug, so a type added later still renders
 * something sensible rather than blank.
 */
function entryTitle(entry: { slug: string; data: unknown }): string {
  const d = (entry.data ?? {}) as Record<string, unknown>;
  for (const key of ["title", "headline", "text", "name"]) {
    const v = d[key];
    if (typeof v === "string" && v.trim() !== "") {
      // Headlines can carry a deliberate line break; the list wants one line.
      return v.split("\n")[0].trim();
    }
  }
  return entry.slug;
}
