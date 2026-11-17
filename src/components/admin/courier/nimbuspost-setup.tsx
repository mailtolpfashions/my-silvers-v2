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
 * NimbusPost's set-up, shown in the partner card's Manage panel: tracking
 * updates (one click — NimbusPost's API registers the webhook) and the pickup
 * warehouse (choose one, or add one with the OTP NimbusPost texts to the
 * contact). The at-a-glance status lives on the card itself.
 */
export function NimbusPostManage({
  status,
  warehouse,
  hook,
  defaults,
}: {
  status: NimbusPostStatus;
  warehouse: { id: string; name: string } | null;
  hook: NimbusPostWebhookStatus | null;
  defaults: Defaults;
}) {
  const healthy = hook && !hook.autoPaused && hook.status === "active";
  return (
    <div className="space-y-6">
      <Block title="Tracking updates">
        <p className="text-sm text-muted-foreground">
          {healthy
            ? hook?.lastDeliveryAt
              ? `Connected. Last update ${new Date(hook.lastDeliveryAt).toLocaleString("en-IN")}.`
              : "Connected. Updates start once a parcel moves."
            : "Lets NimbusPost parcels move to Delivered on their own, and the customer get the Delivered email."}
        </p>
        {!healthy && <ConnectTracking reconnect={Boolean(hook)} />}
      </Block>

      <Block title="Pickup warehouse">
        <p className="text-sm text-muted-foreground">
          Where the courier collects from; returns come back here too.
          {warehouse ? ` In use: ${warehouse.name}.` : ""}
        </p>
        {status.warehouses.length > 0 && (
          <ChooseWarehouse warehouses={status.warehouses} current={warehouse?.id ?? null} />
        )}
        <AddWarehouse defaults={defaults} startOpen={status.warehouses.length === 0} />
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function ConnectTracking({ reconnect }: { reconnect: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
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
    <div className="space-y-2">
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
              const r = await chooseWarehouseAction(picked, chosen?.name ?? "", chosen?.pincode ?? "");
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
