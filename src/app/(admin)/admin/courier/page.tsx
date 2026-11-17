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
import { CourierSettingsForm, type PartnerFact, type PartnerPanel } from "@/components/admin/courier/courier-settings-form";
import { NimbusPostManage, type NimbusPostStatus } from "@/components/admin/courier/nimbuspost-setup";
import { ShiprocketManage, type ShiprocketStatus } from "@/components/admin/courier/shiprocket-setup";
import { listShiprocketPickups, shiprocketWalletBalance } from "@/server/integrations/shiprocket";
import { resolveAppBaseUrl } from "@/server/email/resend";

/**
 * Everything about getting parcels to customers, in one place: which courier
 * partners are used, what shoppers pay for shipping, the dispatch and
 * delivery times promised, and each partner's account set-up (pickup
 * location, tracking updates, wallet). Moved out of Settings, which keeps the
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
  const [settings, config, nimbus, shiprocket] = await Promise.all([
    getStoreSettings(),
    getCourierConfig(),
    connected.nimbuspost ? loadNimbusPost() : Promise.resolve(null),
    connected.shiprocket ? loadShiprocket() : Promise.resolve(null),
  ]);
  const base = resolveAppBaseUrl(process.env.APP_BASE_URL, process.env.VERCEL_ENV === "production");
  const defaults = warehouseDefaults();

  // ── Shiprocket card ──
  const srPickup = process.env.SHIPROCKET_PICKUP_LOCATION
    ? { location: process.env.SHIPROCKET_PICKUP_LOCATION, pincode: process.env.SHIPROCKET_PICKUP_PINCODE ?? null, fromEnv: true }
    : config.shiprocketPickupLocation
      ? { location: config.shiprocketPickupLocation, pincode: config.shiprocketPickupPincode, fromEnv: false }
      : null;
  const shiprocketPanel: PartnerPanel = {
    connected: connected.shiprocket,
    facts: shiprocket
      ? [
          { label: "Account", value: shiprocket.error ? "Problem" : "Connected", tone: shiprocket.error ? "bad" : "ok" },
          walletFact(shiprocket.wallet),
          { label: "Pickup", value: srPickup?.location ?? "Not set", tone: srPickup ? "muted" : "bad" },
          trackingFact(config.shiprocketLastWebhookAt ? "on" : "off"),
        ]
      : [],
    warning: shiprocket?.error
      ?? (shiprocket && shiprocket.wallet !== null && shiprocket.wallet <= 0
        ? "Wallet is empty — Shiprocket bookings fail until you recharge on their website."
        : !srPickup ? "Choose a pickup location in Manage." : null),
    manage: shiprocket ? (
      <ShiprocketManage
        status={shiprocket}
        pickup={srPickup}
        // Shiprocket refuses webhook URLs containing "shiprocket" — see the alias route.
        webhookUrl={`${base}/api/webhooks/courier-updates`}
        webhookToken={config.shiprocketWebhookToken}
        lastUpdateAt={config.shiprocketLastWebhookAt}
        defaults={defaults}
      />
    ) : null,
  };

  // ── NimbusPost card ──
  const npWarehouse = process.env.NIMBUSPOST_WAREHOUSE_ID
    ? { id: process.env.NIMBUSPOST_WAREHOUSE_ID, name: "Set in Vercel" }
    : config.nimbuspostWarehouseId
      ? { id: config.nimbuspostWarehouseId, name: config.nimbuspostWarehouseName ?? "Pickup warehouse" }
      : null;
  const npHook = nimbus?.webhooks.find((w) => w.id === config.nimbuspostWebhookId) ?? null;
  const npTracking = npHook ? (npHook.autoPaused || npHook.status !== "active" ? "paused" : "on") : "off";
  const nimbusPanel: PartnerPanel = {
    connected: connected.nimbuspost,
    facts: nimbus
      ? [
          { label: "Account", value: nimbus.error ? "Problem" : "Connected", tone: nimbus.error ? "bad" : "ok" },
          walletFact(nimbus.wallet),
          { label: "Pickup", value: npWarehouse?.name ?? "Not set", tone: npWarehouse ? "muted" : "bad" },
          trackingFact(npTracking),
        ]
      : [],
    warning: nimbus?.error
      ?? (nimbus && nimbus.wallet !== null && nimbus.wallet <= 0
        ? "Wallet is empty — NimbusPost bookings fail until you recharge on their website."
        : !npWarehouse ? "Add a pickup warehouse in Manage." : npTracking !== "on" ? "Connect tracking in Manage." : null),
    manage: nimbus ? (
      <NimbusPostManage status={nimbus} warehouse={npWarehouse} hook={npHook} defaults={defaults} />
    ) : null,
  };

  return (
    <>
      <PageHeader
        title="Courier"
        description="Who ships your parcels, what shoppers pay, and how long delivery takes."
      />
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
        partners={{ shiprocket: shiprocketPanel, nimbuspost: nimbusPanel }}
      />
    </>
  );
}

function walletFact(wallet: number | null): PartnerFact {
  if (wallet === null) return { label: "Wallet", value: "—", tone: "muted" };
  return { label: "Wallet", value: `₹${wallet.toLocaleString("en-IN")}`, tone: wallet > 0 ? "ok" : "bad" };
}

function trackingFact(state: "on" | "paused" | "off"): PartnerFact {
  return {
    label: "Tracking",
    value: state === "on" ? "Connected" : state === "paused" ? "Paused" : "Not set up",
    tone: state === "on" ? "ok" : "bad",
  };
}

/** Read-only and free. A failure (a wrong password, say) shows on the page instead of breaking it. */
async function loadShiprocket(): Promise<ShiprocketStatus> {
  const [wallet, pickups] = await Promise.allSettled([shiprocketWalletBalance(), listShiprocketPickups()]);
  const failed = [wallet, pickups].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  return {
    wallet: wallet.status === "fulfilled" ? wallet.value : null,
    pickups: pickups.status === "fulfilled" ? pickups.value : [],
    error: failed ? (failed.reason instanceof Error ? failed.reason.message : "Could not read the Shiprocket account.") : null,
  };
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
