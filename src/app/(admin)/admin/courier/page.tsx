import { OwnerOnlyNotice, viewerIsOwner } from "@/components/admin/owner-only";
import { PageHeader } from "@/components/layout/page-header";
import { getStoreSettings } from "@/server/settings/store-settings";
import { getCourierConfig } from "@/server/settings/courier-config";
import { courierConnections } from "@/server/couriers";
import {
  listNimbusPostWarehouses,
  listNimbusPostWebhooks,
  nimbusPostWalletBalance,
} from "@/server/integrations/nimbuspost";
import { CourierSettingsForm } from "@/components/admin/courier/courier-settings-form";
import { NimbusPostSetup, type NimbusPostStatus } from "@/components/admin/courier/nimbuspost-setup";

/**
 * Everything about getting parcels to customers, in one place: which courier
 * partners are used, what shoppers pay for shipping, the dispatch and
 * delivery times promised, and NimbusPost's account set-up (pickup warehouse,
 * tracking updates, wallet). Moved out of Settings, which keeps the
 * non-courier switches.
 *
 * Owner only — it changes what every customer is charged and promised, and
 * spends the courier wallets. Every action behind it re-checks.
 */
export const metadata = { title: "Courier" };

/** Blocking, like every admin route — the owner check reads the session. */
export const instant = false;

export default async function AdminCourierPage() {
  if (!(await viewerIsOwner())) return <OwnerOnlyNotice area="Courier" />;

  const connected = courierConnections();
  const [settings, config, nimbus] = await Promise.all([
    getStoreSettings(),
    getCourierConfig(),
    connected.nimbuspost ? loadNimbusPost() : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="Courier"
        description="Your courier partners, shipping charges and delivery times. Changes take effect immediately."
      />
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <CourierSettingsForm
          initial={{
            courierPartners: settings.courierPartners,
            shippingCharge: settings.shippingChargePaise / 100,
            freeShippingThreshold: settings.freeShippingThresholdPaise / 100,
            handlingTimeMinDays: settings.handlingTimeMinDays,
            handlingTimeMaxDays: settings.handlingTimeMaxDays,
            transitTimeMinDays: settings.transitTimeMinDays,
            transitTimeMaxDays: settings.transitTimeMaxDays,
          }}
          connected={connected}
        />
        <NimbusPostSetup
          connected={connected.nimbuspost}
          status={nimbus}
          warehouse={
            process.env.NIMBUSPOST_WAREHOUSE_ID
              ? { id: process.env.NIMBUSPOST_WAREHOUSE_ID, name: "Set in Vercel (NIMBUSPOST_WAREHOUSE_ID)" }
              : config.nimbuspostWarehouseId
                ? { id: config.nimbuspostWarehouseId, name: config.nimbuspostWarehouseName ?? "Pickup warehouse" }
                : null
          }
          trackingWebhookId={config.nimbuspostWebhookId}
          defaults={warehouseDefaults()}
        />
      </div>
    </>
  );
}

/** Read-only and free. A failure shows on the page instead of breaking it. */
async function loadNimbusPost(): Promise<NimbusPostStatus> {
  const [wallet, warehouses, webhooks] = await Promise.allSettled([
    nimbusPostWalletBalance(),
    listNimbusPostWarehouses(),
    listNimbusPostWebhooks(),
  ]);
  const failed = [wallet, warehouses, webhooks].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  return {
    wallet: wallet.status === "fulfilled" ? wallet.value : null,
    warehouses: warehouses.status === "fulfilled" ? warehouses.value : [],
    webhooks: webhooks.status === "fulfilled" ? webhooks.value : [],
    error: failed ? (failed.reason instanceof Error ? failed.reason.message : "Could not read the NimbusPost account.") : null,
  };
}

/**
 * The pickup form's starting values, from the shop's invoice details (the
 * INVOICE_* settings) — so the registered address is typed once, not twice.
 * A pincode and city are picked out of the address line when present.
 */
function warehouseDefaults() {
  const address = process.env.INVOICE_ADDRESS ?? "";
  const pincode = /\b\d{6}\b/.exec(address)?.[0] ?? process.env.SHIPROCKET_PICKUP_PINCODE ?? "";
  return {
    name: "MY Silvers",
    address,
    pincode,
    state: process.env.INVOICE_STATE ?? "",
    gst: process.env.INVOICE_GSTIN ?? "",
    contactEmail: process.env.INVOICE_EMAIL ?? "",
    contactPhone: (process.env.INVOICE_PHONE ?? "").replace(/\D/g, "").slice(-10),
  };
}
