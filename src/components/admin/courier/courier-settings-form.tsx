"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StickyActions } from "@/components/layout/sticky-actions";
import { ToggleRow, DayField } from "@/components/admin/store-settings-form";
import { saveCourierSettingsAction } from "@/actions/admin-courier-actions";

const CARD = "rounded-lg border bg-background p-5";

type Values = {
  courierPartners: { shiprocket: boolean; nimbuspost: boolean };
  /** Rupees — paise is the storage unit; the action converts. */
  shippingCharge: number;
  freeShippingThreshold: number;
  handlingTimeMinDays: number;
  handlingTimeMaxDays: number;
  transitTimeMinDays: number;
  transitTimeMaxDays: number;
};

/**
 * Courier partners, what shoppers pay for shipping, and the delivery times
 * promised — the three things that used to be spread across Settings.
 *
 * Money and day fields are held as the raw STRING typed, not a number, for the
 * reason the Settings form gives: a number snaps "" to 0, so a field could
 * never be cleared to retype. Parsed on save.
 */
export function CourierSettingsForm({
  initial,
  connected,
}: {
  initial: Values;
  /** Which partners have API keys — one without can't be switched on. */
  connected: { shiprocket: boolean; nimbuspost: boolean };
}) {
  const [partners, setPartners] = useState(initial.courierPartners);
  const [charge, setCharge] = useState(String(initial.shippingCharge));
  const [threshold, setThreshold] = useState(String(initial.freeShippingThreshold));
  const [handlingMin, setHandlingMin] = useState(String(initial.handlingTimeMinDays));
  const [handlingMax, setHandlingMax] = useState(String(initial.handlingTimeMaxDays));
  const [transitMin, setTransitMin] = useState(String(initial.transitTimeMinDays));
  const [transitMax, setTransitMax] = useState(String(initial.transitTimeMaxDays));
  const [saving, setSaving] = useState(false);

  const snapshot = JSON.stringify([partners, charge, threshold, handlingMin, handlingMax, transitMin, transitMax]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const money = [Number(charge), Number(threshold)];
    if (!money.every(Number.isFinite)) {
      toast.error("Amounts must be numbers.");
      return;
    }
    // Empty reads as "not stated" (0) — clearing a field withdraws the claim.
    const day = (raw: string) => (raw.trim() === "" ? 0 : Number(raw));
    const days = {
      handlingTimeMinDays: day(handlingMin),
      handlingTimeMaxDays: day(handlingMax),
      transitTimeMinDays: day(transitMin),
      transitTimeMaxDays: day(transitMax),
    };
    if (!Object.values(days).every((n) => Number.isInteger(n) && n >= 0)) {
      toast.error("Day counts must be whole numbers.");
      return;
    }
    setSaving(true);
    const result = await saveCourierSettingsAction({
      courierPartners: partners,
      shippingCharge: money[0],
      freeShippingThreshold: money[1],
      ...days,
    });
    setSaving(false);
    if (result.ok) {
      setSavedSnapshot(snapshot);
      toast.success("Courier settings saved.");
    } else toast.error(result.error);
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">Courier partners</h2>
        <p className="text-sm text-muted-foreground">
          When you press Ship order, every partner switched on here is asked for prices and the
          cheapest courier is selected for you. Keep at least one on.
        </p>
        {(["shiprocket", "nimbuspost"] as const).map((p) => {
          const label = p === "shiprocket" ? "Shiprocket" : "NimbusPost";
          return (
            <ToggleRow
              key={p}
              id={`courier-${p}`}
              label={label}
              description={
                connected[p]
                  ? `Connected. Include ${label}'s couriers and prices when shipping.`
                  : `Not connected — add the ${label} API keys in Vercel, then switch it on here.`
              }
              checked={connected[p] && partners[p]}
              onChange={(on) => setPartners((v) => ({ ...v, [p]: on }))}
              disabled={saving || !connected[p]}
            />
          );
        })}
      </section>

      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">Shipping charges</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          What shoppers pay at checkout. Applied to new orders; orders already placed keep the
          charge they were quoted.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="shippingCharge">Shipping charge (₹)</Label>
            <Input id="shippingCharge" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} disabled={saving} />
            <p className="text-xs text-muted-foreground">Set to 0 for free shipping on every order.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="freeShippingThreshold">Free above (₹)</Label>
            <Input id="freeShippingThreshold" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={saving} />
            <p className="text-xs text-muted-foreground">Orders at or above this subtotal ship free.</p>
          </div>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">Dispatch &amp; delivery times</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Shown to shoppers as the expected delivery date in emails, and published to Google next to
          the shop in search results. Leave them at 0 and no estimate is shown or published.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <DayField id="handlingTimeMinDays" label="Dispatch within — from (days)" value={handlingMin} onChange={setHandlingMin} disabled={saving} />
          <DayField id="handlingTimeMaxDays" label="Dispatch within — to (days)" value={handlingMax} onChange={setHandlingMax} disabled={saving} />
          <DayField id="transitTimeMinDays" label="Delivery takes — from (days)" value={transitMin} onChange={setTransitMin} disabled={saving} />
          <DayField id="transitTimeMaxDays" label="Delivery takes — to (days)" value={transitMax} onChange={setTransitMax} disabled={saving} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Dispatch is how long a piece sits with the shop; delivery is time with the courier after that.
        </p>
      </section>

      {/* Sticky so Save stays in reach down a long form — see StickyActions. */}
      <StickyActions className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {snapshot !== savedSnapshot ? "Unsaved changes" : ""}
        </span>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save courier settings"}
        </Button>
      </StickyActions>
    </form>
  );
}
