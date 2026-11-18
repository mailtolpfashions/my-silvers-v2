import { PageHeader } from "@/components/layout/page-header";
import { OwnerOnlyNotice, viewerIsOwner } from "@/components/admin/owner-only";
import { PricingSettings } from "@/components/admin/pricing-settings";
import { getCostingDefaults } from "@/server/settings/costing-config";
import { getStoreSettings } from "@/server/settings/store-settings";

/** Blocking, like every other admin route — see admin/customers/page.tsx. */
export const instant = false;

/**
 * Pricing — its own page in the Owner menu, not a card in Settings: it is a
 * tool the owner works with (try a piece, recalculate prices), where Settings
 * is switches set once. Owner only; every action behind it re-checks.
 */
export default async function AdminPricingPage() {
  if (!(await viewerIsOwner())) return <OwnerOnlyNotice area="Pricing" />;

  const [costing, settings] = await Promise.all([getCostingDefaults(), getStoreSettings()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing"
        description="How a product's price is worked out from its weight and making charge."
      />
      <PricingSettings
        costing={costing}
        charmPricing={settings.charmPricing}
        charmDirection={settings.charmDirection}
      />
    </div>
  );
}
