"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  sendWarehouseOtpAction,
  createWarehouseAction,
  chooseWarehouseAction,
  connectTrackingAction,
} from "@/actions/admin-courier-actions";
import type { NimbusPostWarehouse, NimbusPostWebhookStatus } from "@/server/integrations/nimbuspost";

const CARD = "rounded-lg border bg-background p-5";

export type NimbusPostStatus = {
  wallet: number | null;
  warehouses: NimbusPostWarehouse[];
  webhooks: NimbusPostWebhookStatus[];
  /** Why the account couldn't be read, when it couldn't. */
  error: string | null;
};

type Defaults = {
  name: string;
  address: string;
  pincode: string;
  state: string;
  gst: string;
  contactEmail: string;
  contactPhone: string;
};

/**
 * NimbusPost's account set-up, done from here instead of their dashboard:
 * the pickup warehouse (add one with the OTP NimbusPost texts to the contact,
 * or pick one that already exists), tracking updates, and the wallet.
 *
 * Everything shown is read live from NimbusPost when the page loads.
 */
export function NimbusPostSetup({
  connected,
  status,
  warehouse,
  trackingWebhookId,
  defaults,
}: {
  connected: boolean;
  status: NimbusPostStatus | null;
  warehouse: { id: string; name: string } | null;
  trackingWebhookId: string | null;
  defaults: Defaults;
}) {
  if (!connected || !status) {
    return (
      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">NimbusPost</h2>
        <p className="text-sm text-muted-foreground">
          Not connected. Add <code>NIMBUSPOST_API_KEY</code> and <code>NIMBUSPOST_API_SECRET</code> in
          Vercel (from NimbusPost → Settings → API Keys, with the admin role), redeploy, and this
          panel lets you set up the pickup warehouse and tracking.
        </p>
      </section>
    );
  }

  const hook = status.webhooks.find((w) => w.id === trackingWebhookId) ?? null;

  return (
    <div className="space-y-6">
      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">NimbusPost account</h2>
        {status.error && (
          <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{status.error}</p>
        )}
        <dl className="divide-y text-sm">
          <Row label="Connection" value={<span className="text-green-700">Connected</span>} />
          <Row
            label="Wallet balance"
            value={
              status.wallet === null ? (
                "—"
              ) : (
                <span className={status.wallet <= 0 ? "font-semibold text-destructive" : "font-semibold"}>
                  ₹{status.wallet.toLocaleString("en-IN")}
                </span>
              )
            }
            hint={
              status.wallet !== null && status.wallet <= 0
                ? "Bookings need balance — recharge on the NimbusPost website (it can't be done from here)."
                : undefined
            }
          />
          <Row
            label="Pickup warehouse"
            value={warehouse ? warehouse.name : <span className="text-destructive">Not set</span>}
            hint={warehouse ? undefined : "NimbusPost can't book a parcel until one is set — add it below."}
          />
          <Row
            label="Tracking updates"
            value={
              hook ? (
                hook.autoPaused || hook.status !== "active" ? (
                  <span className="text-destructive">Paused</span>
                ) : (
                  <span className="text-green-700">Connected</span>
                )
              ) : (
                <span className="text-destructive">Not connected</span>
              )
            }
            hint={
              hook?.lastDeliveryAt
                ? `Last update ${new Date(hook.lastDeliveryAt).toLocaleString("en-IN")}${hook.lastDeliveryStatus ? ` (HTTP ${hook.lastDeliveryStatus})` : ""}`
                : hook
                  ? "No updates received yet — they start once a parcel moves."
                  : "Without this, NimbusPost parcels don't move to Delivered on their own."
            }
          />
        </dl>
        {(!hook || hook.autoPaused || hook.status !== "active") && <ConnectTracking reconnect={Boolean(hook)} />}
      </section>

      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">Pickup warehouse</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Where the courier collects parcels from. Returned parcels come back here too.
        </p>
        {status.warehouses.length > 0 && <ChooseWarehouse warehouses={status.warehouses} current={warehouse?.id ?? null} />}
        <AddWarehouse defaults={defaults} startOpen={status.warehouses.length === 0} />
      </section>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-4">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="text-right">{value}</dd>
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ConnectTracking({ reconnect }: { reconnect: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      className="mt-4"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const r = await connectTrackingAction();
          if (r.ok) {
            toast.success("Tracking updates connected.");
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      {isPending ? "Connecting…" : reconnect ? "Reconnect tracking" : "Connect tracking"}
    </Button>
  );
}

function ChooseWarehouse({ warehouses, current }: { warehouses: NimbusPostWarehouse[]; current: string | null }) {
  const [picked, setPicked] = useState(current ?? warehouses[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const chosen = warehouses.find((w) => w.id === picked);
  return (
    <div className="mb-5 space-y-2">
      <Label htmlFor="np-warehouse">Use an existing warehouse</Label>
      <div className="flex flex-wrap gap-2">
        <select
          id="np-warehouse"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.city || w.pincode ? ` — ${[w.city, w.pincode].filter(Boolean).join(" ")}` : ""}
              {w.status !== "active" ? ` (${w.status})` : ""}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending || !chosen || picked === current}
          onClick={() =>
            startTransition(async () => {
              const r = await chooseWarehouseAction(picked, chosen?.name ?? "");
              if (r.ok) {
                toast.success("Pickup warehouse saved.");
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          {picked === current ? "In use" : "Use this"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Add a warehouse in three steps NimbusPost requires: fill in the address,
 * get an OTP on the contact's phone, enter it. Pre-filled from the shop's
 * invoice details so the registered address isn't typed twice.
 */
function AddWarehouse({ defaults, startOpen }: { defaults: Defaults; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [f, setF] = useState({
    name: defaults.name,
    address: defaults.address,
    addressOpt: "",
    city: "",
    pincode: defaults.pincode,
    state: defaults.state,
    contactName: "",
    contactPhone: defaults.contactPhone,
    contactEmail: defaults.contactEmail,
    gst: defaults.gst,
  });
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Add a new pickup warehouse
      </Button>
    );
  }

  function sendOtp() {
    startTransition(async () => {
      const r = await sendWarehouseOtpAction(f.contactPhone);
      if (r.ok) {
        setOtpSentTo(f.contactPhone);
        toast.success("OTP sent to the contact's phone.");
      } else toast.error(r.error);
    });
  }

  function create() {
    startTransition(async () => {
      const r = await createWarehouseAction({ ...f, otp });
      if (r.ok) {
        toast.success(`Warehouse "${r.name}" added and in use.`);
        setOpen(false);
        setOtpSentTo(null);
        setOtp("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const field = (k: keyof typeof f, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`wh-${k}`}>{label}</Label>
      <Input id={`wh-${k}`} value={f[k]} onChange={set(k)} disabled={isPending || Boolean(otpSentTo)} {...props} />
    </div>
  );

  return (
    <div className="space-y-4 rounded-md border p-4">
      <p className="text-sm font-medium">New pickup warehouse</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Warehouse name", { maxLength: 40 })}
        {field("gst", "GSTIN (optional)", { maxLength: 15 })}
        <div className="sm:col-span-2">{field("address", "Address")}</div>
        <div className="sm:col-span-2">{field("addressOpt", "Address line 2 (optional)")}</div>
        {field("city", "City")}
        {field("pincode", "Pincode", { inputMode: "numeric", maxLength: 6 })}
        {field("state", "State")}
        {field("contactName", "Contact name")}
        {field("contactPhone", "Contact mobile", { inputMode: "tel" })}
        {field("contactEmail", "Contact email (optional)", { type: "email" })}
      </div>

      {!otpSentTo ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={sendOtp} disabled={isPending}>
            {isPending ? "Sending…" : "Send OTP"}
          </Button>
          {!startOpen && (
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            NimbusPost texts a code to the contact mobile to confirm it.
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="wh-otp">OTP sent to {otpSentTo}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="wh-otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              className="w-36"
              disabled={isPending}
            />
            <Button size="sm" onClick={create} disabled={isPending || otp.length < 4}>
              {isPending ? "Adding…" : "Verify & add warehouse"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOtpSentTo(null)} disabled={isPending}>
              Edit details
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
