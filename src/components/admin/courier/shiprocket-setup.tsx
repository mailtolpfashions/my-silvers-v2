"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  chooseShiprocketPickupAction,
  addShiprocketPickupAction,
  generateShiprocketTokenAction,
} from "@/actions/admin-courier-actions";
import type { ShiprocketPickup } from "@/server/integrations/shiprocket";

export type ShiprocketStatus = {
  wallet: number | null;
  pickups: ShiprocketPickup[];
  /** Why the account couldn't be read, when it couldn't. */
  error: string | null;
};

type Defaults = {
  address: string;
  pincode: string;
  state: string;
  gst: string;
  contactEmail: string;
  contactPhone: string;
};

/**
 * Shiprocket's set-up, shown in the partner card's Manage panel: the pickup
 * location (choose or add) and tracking updates. Shiprocket's API can't
 * register a webhook, so tracking is the URL + token to paste into its
 * dashboard; the card's "Tracking" status says whether updates are arriving.
 */
export function ShiprocketManage({
  status,
  pickup,
  webhookUrl,
  webhookToken,
  lastUpdateAt,
  defaults,
}: {
  status: ShiprocketStatus;
  pickup: { location: string; pincode: string | null; fromEnv: boolean } | null;
  webhookUrl: string;
  webhookToken: string | null;
  lastUpdateAt: string | null;
  defaults: Defaults;
}) {
  return (
    <div className="space-y-6">
      <Block title="Pickup location">
        <p className="text-sm text-muted-foreground">
          Where Shiprocket&apos;s couriers collect from; its pincode is where prices are measured from.
          {pickup?.fromEnv ? " Currently fixed in Vercel (SHIPROCKET_PICKUP_LOCATION), which wins over a choice here." : ""}
        </p>
        {status.pickups.length > 0 && <ChoosePickup pickups={status.pickups} current={pickup?.location ?? null} />}
        <AddPickup defaults={defaults} startOpen={status.pickups.length === 0} />
      </Block>

      <Block title="Tracking updates">
        <p className="text-sm text-muted-foreground">
          {lastUpdateAt
            ? `Working. Last update received ${new Date(lastUpdateAt).toLocaleString("en-IN")}.`
            : "Shiprocket only lets you switch this on in its own dashboard:"}
        </p>
        {!lastUpdateAt && (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>In Shiprocket, open Settings → API → Webhooks.</li>
            <li>Paste the URL and the token below, switch it on, and save.</li>
          </ol>
        )}
        <CopyField label="Webhook URL" value={webhookUrl} />
        {webhookToken ? (
          <CopyField label="Security token" value={webhookToken} />
        ) : (
          <p className="text-sm text-muted-foreground">No token yet — make one first.</p>
        )}
        <MakeToken hasToken={Boolean(webhookToken)} />
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

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast.success(`${label} copied.`);
            } catch {
              toast.error("Couldn't copy — select the text and copy it instead.");
            }
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}

function MakeToken({ hasToken }: { hasToken: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant={hasToken ? "outline" : "default"}
      disabled={isPending}
      onClick={() => {
        if (hasToken && !window.confirm("Make a new token? Updates sent with the old one are refused until you paste the new one into Shiprocket.")) return;
        startTransition(async () => {
          const r = await generateShiprocketTokenAction();
          if (r.ok) {
            toast.success("Token made — paste it into Shiprocket.");
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      {isPending ? "Making…" : hasToken ? "Make a new token" : "Make a token"}
    </Button>
  );
}

function ChoosePickup({ pickups, current }: { pickups: ShiprocketPickup[]; current: string | null }) {
  const [picked, setPicked] = useState(current ?? pickups.find((p) => p.primary)?.location ?? pickups[0]?.location ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const chosen = pickups.find((p) => p.location === picked);
  return (
    <div className="space-y-2">
      <Label htmlFor="sr-pickup">Use an existing pickup location</Label>
      <div className="flex flex-wrap gap-2">
        <select
          id="sr-pickup"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        >
          {pickups.map((p) => (
            <option key={p.location} value={p.location}>
              {p.location}
              {p.city || p.pincode ? ` — ${[p.city, p.pincode].filter(Boolean).join(" ")}` : ""}
              {p.phoneVerified ? "" : " (phone not verified)"}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending || !chosen || picked === current}
          onClick={() =>
            startTransition(async () => {
              const r = await chooseShiprocketPickupAction(picked, chosen?.pincode ?? "");
              if (r.ok) {
                toast.success("Pickup location saved.");
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          {picked === current ? "In use" : "Use this"}
        </Button>
      </div>
      {chosen && !chosen.phoneVerified && (
        <p className="text-xs text-destructive">
          Shiprocket hasn&apos;t verified this location&apos;s phone yet — verify it in the Shiprocket
          dashboard, or couriers may not collect.
        </p>
      )}
    </div>
  );
}

/** Adds a pickup location to the Shiprocket account, pre-filled from the invoice details. */
function AddPickup({ defaults, startOpen }: { defaults: Defaults; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [f, setF] = useState({
    location: "MY Silvers",
    name: "",
    email: defaults.contactEmail,
    phone: defaults.contactPhone,
    address: defaults.address,
    address2: "",
    city: "",
    state: defaults.state,
    pincode: defaults.pincode,
    gstin: defaults.gst,
  });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((v) => ({ ...v, [k]: e.target.value }));

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Add a new pickup location
      </Button>
    );
  }

  const field = (k: keyof typeof f, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`sr-${k}`}>{label}</Label>
      <Input id={`sr-${k}`} value={f[k]} onChange={set(k)} disabled={isPending} {...props} />
    </div>
  );

  return (
    <div className="space-y-4 rounded-md border p-4">
      <p className="text-sm font-medium">New pickup location</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("location", "Location name", { maxLength: 36 })}
        {field("gstin", "GSTIN (optional)", { maxLength: 15 })}
        <div className="sm:col-span-2">{field("address", "Address (first line, up to 80 characters)", { maxLength: 80 })}</div>
        <div className="sm:col-span-2">{field("address2", "Address line 2 (optional)")}</div>
        {field("city", "City")}
        {field("pincode", "Pincode", { inputMode: "numeric", maxLength: 6 })}
        {field("state", "State")}
        {field("name", "Contact name")}
        {field("phone", "Contact mobile", { inputMode: "tel" })}
        {field("email", "Contact email", { type: "email" })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const r = await addShiprocketPickupAction(f);
              if (r.ok) {
                toast.success(
                  r.phoneVerified
                    ? `Pickup location "${r.location}" added and in use.`
                    : `Pickup location "${r.location}" added — verify its phone in the Shiprocket dashboard.`
                );
                setOpen(false);
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          {isPending ? "Adding…" : "Add pickup location"}
        </Button>
        {!startOpen && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
