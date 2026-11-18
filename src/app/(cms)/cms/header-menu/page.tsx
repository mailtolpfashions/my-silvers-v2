import { PageHeader } from "@/components/layout/page-header";
import { HeaderMenuForm } from "@/components/cms/header-menu-form";
import { requireRoleForPage } from "@/server/auth/require-role";
import { getStoreSettings } from "@/server/settings/store-settings";
import { getCollections } from "@/server/cms/collections";

/** Blocking, like the rest of Studio — per-user and behind a login. */
export const instant = false;

/** Studio → Header menu: the links under Jewellery and Gifting in the shop's header. */
export default async function HeaderMenuPage() {
  await requireRoleForPage("admin", "editor");
  const [settings, collections] = await Promise.all([getStoreSettings(), getCollections()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Header menu"
        description="The links under Jewellery and Gifting in the shop's header."
      />
      <HeaderMenuForm
        initial={{
          navShopFor: settings.navShopFor,
          navFinishes: settings.navFinishes,
          navOccasions: settings.navOccasions,
        }}
        collections={collections.map((c) => ({ slug: c.slug, title: c.title }))}
      />
    </div>
  );
}
