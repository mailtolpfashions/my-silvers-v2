import Link from "next/link";
import { notFound } from "next/navigation";
import { listEntries, getSingletonEntry, CmsError } from "@/server/cms/entries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        <h1 className="text-2xl font-semibold">{type.label}</h1>
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{type.label}</h1>
        <Button asChild size="sm">
          <Link href={`/cms/content/${typeName}/new`}>New entry</Link>
        </Button>
      </div>

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
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-sm font-medium">{entry.slug}</TableCell>
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
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  No entries yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
