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

const CARD = "rounded-lg border bg-background p-5";

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
 * Shiprocket's account set-up, the twin of the NimbusPost panel: wallet,
 * pickup location (choose one or add one), and tracking updates.
 *
 * One difference from NimbusPost: Shiprocket's API can't register a webhook,
 * so tracking is set up by pasting the URL and token shown here into
 * Shiprocket's dashboard. "Last update received" says whether it's working.
 */
export function ShiprocketSetup({
  connected,
  status,
  pickup,
  webhookUrl,
  webhookToken,
  lastUpdateAt,
  defaults,
}: {
  connected: boolean;
  status: ShiprocketStatus | null;
  pickup: { location: string; pincode: string | null; fromEnv: boolean } | null;
  webhookUrl: string;
  webhookToken: string | null;
  lastUpdateAt: string | null;
  defaults: Defaults;
}) {
  if (!connected || !status) {
    return (
      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">Shiprocket</h2>
        <p className="text-sm text-muted-foreground">
          Not connected. Add <code>SHIPROCKET_EMAIL</code> and <code>SHIPROCKET_PASSWORD</code> (the
          API user from Shiprocket → Settings → API) in Vercel and redeploy.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">Shiprocket account</h2>
        {status.error && (
          <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{status.error}</p>
        )}
        <dl className="divide-y text-sm">
          <Row
            label="Connection"
            value={status.error ? <span className="text-destructive">Problem</span> : <span className="text-green-700">Connected</span>}
          />
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
                ? "Bookings need balance — recharge on the Shiprocket website (it can't be done from here)."
                : undefined
            }
          />
          <Row
            label="Pickup location"
            value={pickup ? pickup.location : <span className="text-destructive">Not set</span>}
            hint={
              pickup?.fromEnv
                ? "Set in Vercel (SHIPROCKET_PICKUP_LOCATION) — that wins over the choice below."
                : pickup
                  ? undefined
                  : "Shiprocket can't price or book until one is chosen — pick one below."
            }
          />
          <Row
            label="Tracking updates"
            value={
              lastUpdateAt ? (
                <span className="text-green-700">Working</span>
              ) : (
                <span className="text-muted-foreground">No updates yet</span>
              )
            }
            hint={
              lastUpdateAt
                ? `Last update received ${new Date(lastUpdateAt).toLocaleString("en-IN")}`
                : "Set it up below. Updates start once a parcel moves."
            }
          />
        </dl>
      </section>

      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">Shiprocket pickup location</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Where Shiprocket&apos;s couriers collect from. Its pincode is where Shiprocket&apos;s prices are
          measured from.
        </p>
        {status.pickups.length > 0 && (
          <ChoosePickup pickups={status.pickups} current={pickup?.location ?? null} />
        )}
        <AddPickup defaults={defaults} startOpen={status.pickups.length === 0} />
      </section>

      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">Shiprocket tracking updates</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          So Shiprocket parcels move to Delivered on their own and customers get the Delivered email.
          Shiprocket only lets you switch this on in its own dashboard:
        </p>
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm">
          <li>In Shiprocket, open Settings → API → Webhooks.</li>
          <li>Paste the URL below into the webhook URL.</li>
          <li>Paste the token below into the security token.</li>
          <li>Switch the webhook on and save.</li>
        </ol>
        <CopyField label="Webhook URL" value={webhookUrl} />
        {webhookToken ? (
          <CopyField label="Security token" value={webhookToken} />
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No token yet — make one first.</p>
        )}
        <MakeToken hasToken={Boolean(webhookToken)} />
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

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 space-y-1.5">
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
      className="mt-4"
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
    <div className="mb-5 space-y-2">
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
