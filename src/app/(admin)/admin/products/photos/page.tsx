import Link from "next/link";
import { prisma } from "@/server/db";
import { requireRoleForPage } from "@/server/auth/require-role";
import { PageHeader } from "@/components/layout/page-header";
import { BulkPhotoUpload } from "@/components/admin/bulk-photo-upload";

/** Blocking, like every other admin route — see admin/customers/page.tsx. */
export const instant = false;

/**
 * Products → Bulk photos. The upload itself is BulkPhotoUpload; this page adds
 * the routine around it and the one list that tells you what is left to do.
 */
export default async function BulkPhotosPage() {
  await requireRoleForPage("admin");

  const [missingCount, missing] = await Promise.all([
    prisma.product.count({ where: { isActive: true, images: { isEmpty: true } } }),
    prisma.product.findMany({
      where: { isActive: true, images: { isEmpty: true } },
      select: { id: true, sku: true, name: true },
      orderBy: { sku: "asc" },
      take: 30,
    }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Bulk photos"
        description="Drop in photos named by SKU and they're uploaded and attached to the right products."
        backHref="/admin/products"
        backLabel="Products"
      />

      <BulkPhotoUpload />

      <details className="rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">How to add a new batch of products</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Photograph</strong> each piece. Put the main photo first.
          </li>
          <li>
            <strong className="text-foreground">Rename the photos to the SKU.</strong> In Windows File
            Explorer, select one piece&apos;s photos, press <kbd>F2</kbd>, type the SKU (e.g.{" "}
            <code>MYS-RNG-014</code>) and press <kbd>Enter</kbd> — Windows names them{" "}
            <code>MYS-RNG-014 (1).jpg</code>, <code>(2)</code>… which this page understands. Or name
            them <code>MYS-RNG-014_1.jpg</code> by hand.
          </li>
          <li>
            <strong className="text-foreground">Fill the CSV</strong> (Products → Import CSV → download
            the template): name, SKU, category, price, stock, sizes. Leave the images column empty.
          </li>
          <li>
            <strong className="text-foreground">Import the CSV</strong> — the products are created.
          </li>
          <li>
            <strong className="text-foreground">Drop the photos here</strong>, check the preview, and
            press Upload. Each photo goes to its product in order.
          </li>
          <li>
            <strong className="text-foreground">Check the list below</strong> — anything still without a
            photo shows there.
          </li>
        </ol>
      </details>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          {missingCount === 0
            ? "Every active product has a photo."
            : `${missingCount} active product${missingCount === 1 ? "" : "s"} without a photo`}
        </h2>
        {missing.length > 0 && (
          <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {missing.map((p) => (
              <li key={p.id} className="truncate">
                <Link href={`/admin/products/${p.id}`} className="underline-offset-2 hover:underline">
                  <code className="text-xs">{p.sku}</code> {p.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {missingCount > missing.length && (
          <p className="text-xs text-muted-foreground">…and {missingCount - missing.length} more.</p>
        )}
      </section>
    </div>
  );
}
