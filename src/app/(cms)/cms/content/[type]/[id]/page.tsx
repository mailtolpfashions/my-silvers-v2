import { notFound } from "next/navigation";
import { getCurrentRole } from "@/server/auth/require-role";
import { getContentType, getEntryForEdit, CmsError } from "@/server/cms/entries";
import { parseFields, type EntryData } from "@/server/cms/types";
import { EntryEditor } from "@/components/cms/entry-editor";
import { BreadcrumbLabel } from "@/components/layout/breadcrumb-label";

/**
 * A deliberately blocking route.
 *
 * `cacheComponents` requires runtime data — the session, params, cookies — to
 * sit behind a <Suspense> boundary, or the route cannot prerender a shell. On
 * the storefront that matters and those pages stream. Here it does not, and
 * saying so explicitly is more honest than wrapping a dashboard in skeletons
 * to satisfy a validator:
 *
 *   - everything on this page is per-shopkeeper and behind a login, so there
 *     is no shell worth prerendering and nothing to share between visitors;
 *   - it is opened a handful of times a day by staff, not by shoppers, so no
 *     conversion and no crawl budget rides on it;
 *   - the data IS the page. A skeleton would be replaced wholesale a moment
 *     later, which is a flicker rather than a head start.
 *
 * This is what the error's own `[block]` remedy is for. It does not change how
 * the route renders; it records that blocking is the intended behaviour.
 */
export const instant = false;

export default async function EntryEditorPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type: typeName, id } = await params;
  // From the database, not the token — isAdmin gates the destructive controls
  // (unpublish, delete, restore). See require-role.ts.
  const isAdmin = (await getCurrentRole()) === "admin";

  let type;
  try {
    type = await getContentType(typeName);
  } catch (err) {
    if (err instanceof CmsError) notFound();
    throw err;
  }
  const fields = parseFields(type.fields);

  if (id === "new") {
    return (
      <EntryEditor
        typeName={type.name}
        typeLabel={type.label}
        fields={fields}
        entryId={null}
        initialData={{}}
        initialSeo={{
          metaTitle: "",
          metaDescription: "",
          ogImage: "",
          canonicalUrl: "",
          noIndex: false,
        }}
        status={null}
        versions={[]}
        isAdmin={isAdmin}
      />
    );
  }

  const entry = await getEntryForEdit(id);
  if (!entry || entry.contentType.name !== typeName) notFound();

  /**
   * What to call this entry in the breadcrumb.
   *
   * Entries have no `title` COLUMN — the fields are per-type JSON, so a blog
   * post carries `title` while a banner may not carry anything resembling one.
   * The slug is the reliable fallback: every entry has one and it is
   * human-readable, which an id is not.
   */
  const entryData = entry.data as EntryData;
  const crumb =
    (typeof entryData.title === "string" && entryData.title.trim()) ||
    (typeof entryData.name === "string" && entryData.name.trim()) ||
    entry.slug;

  return (
    <>
    <BreadcrumbLabel value={crumb} />
    <EntryEditor
      typeName={type.name}
      typeLabel={type.label}
      fields={fields}
      entryId={entry.id}
      initialData={entry.data as EntryData}
      initialSeo={{
        metaTitle: entry.seoMetaTitle ?? "",
        metaDescription: entry.seoMetaDescription ?? "",
        ogImage: entry.seoOgImage ?? "",
        canonicalUrl: entry.seoCanonicalUrl ?? "",
        noIndex: entry.seoNoIndex,
      }}
      status={entry.status}
      versions={entry.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        label: v.label,
        savedAt: v.savedAt.toISOString(),
      }))}
      isAdmin={isAdmin}
    />
    </>
  );
}
