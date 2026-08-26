import { requireRole } from "@/server/auth/require-role";
import { PageHeader } from "@/components/layout/page-header";
import { getStoreSettings } from "@/server/settings/store-settings";
import { StoreSettingsForm } from "@/components/admin/store-settings-form";

/**
 * The shop's operational switches.
 *
 * Deliberately not a catch-all "Settings" screen. What belongs here is anything
 * the owner decides rather than deploys — is COD on this month, may guests buy,
 * what does shipping cost. Anything derived from the catalogue belongs on the
 * catalogue screens, and anything that needs a code change is not a setting.
 */
export const metadata = { title: "Settings" };

/**
 * Blocking, like every other admin route — see admin/reviews/page.tsx.
 *
 * `getStoreSettings` is behind `use cache`, but `requireRole` is not and cannot
 * be: it reads the session and then the database, which is the whole point of
 * it (see require-role.ts). So this route blocks regardless of the settings
 * cache.
 */
export const instant = false;

export default async function AdminSettingsPage() {
  await requireRole("admin");

  const settings = await getStoreSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        description="These take effect immediately — there is no publish step."
      />
      <StoreSettingsForm
        initial={{
          codEnabled: settings.codEnabled,
          guestCheckoutEnabled: settings.guestCheckoutEnabled,
          // Paise is the storage unit; rupees is what a person types. The form
          // works in rupees throughout and the action converts back.
          shippingCharge: settings.shippingChargePaise / 100,
          freeShippingThreshold: settings.freeShippingThresholdPaise / 100,
        }}
      />
    </>
  );
}
