"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveStoreSettingsAction } from "@/actions/admin-settings-actions";

export type StoreSettingsFormValues = {
  codEnabled: boolean;
  guestCheckoutEnabled: boolean;
  /** Rupees, not paise — see the note on the settings page. */
  shippingCharge: number;
  freeShippingThreshold: number;
  giftWrapEnabled: boolean;
  giftWrapCharge: number;
  /** Whole days. Zero throughout means "not stated" — see the section copy. */
  returnWindowDays: number;
  returnShippingPaidBy: "customer" | "merchant";
  handlingTimeMinDays: number;
  handlingTimeMaxDays: number;
  transitTimeMinDays: number;
  transitTimeMaxDays: number;
};

/**
 * A labelled switch with the sentence explaining what it does.
 *
 * The description is not decoration here. "Cash on delivery" as a bare toggle
 * does not tell the person flipping it that existing COD orders are unaffected,
 * and that is exactly the thing they will worry about before touching it.
 */
function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b py-5">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

/**
 * A day-count input. Same raw-string state discipline as the money fields, and
 * for the same reason — see the note in the component below.
 */
function DayField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function StoreSettingsForm({ initial }: { initial: StoreSettingsFormValues }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  /**
   * Money fields are held as the raw STRING the admin typed, not as a number.
   * Storing them as numbers means "" parses to 0 and the field snaps to "0" the
   * moment it is cleared, so clearing it to retype is impossible. Parsed on
   * submit instead, where an unparseable value can be reported.
   */
  const [shippingCharge, setShippingCharge] = useState(String(initial.shippingCharge));
  const [freeThreshold, setFreeThreshold] = useState(String(initial.freeShippingThreshold));
  const [giftWrapCharge, setGiftWrapCharge] = useState(String(initial.giftWrapCharge));

  /** Same reasoning as the money fields above: raw strings, parsed on submit. */
  const [returnWindow, setReturnWindow] = useState(String(initial.returnWindowDays));
  const [handlingMin, setHandlingMin] = useState(String(initial.handlingTimeMinDays));
  const [handlingMax, setHandlingMax] = useState(String(initial.handlingTimeMaxDays));
  const [transitMin, setTransitMin] = useState(String(initial.transitTimeMinDays));
  const [transitMax, setTransitMax] = useState(String(initial.transitTimeMaxDays));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const charge = Number(shippingCharge);
    const threshold = Number(freeThreshold);
    const wrap = Number(giftWrapCharge);
    if (!Number.isFinite(charge) || !Number.isFinite(threshold) || !Number.isFinite(wrap)) {
      toast.error("Amounts must be numbers.");
      return;
    }

    // An empty day field reads as "not stated", which is what 0 means here — so
    // clearing one is a legitimate way to withdraw the claim, not an error.
    const dayCount = (raw: string) => (raw.trim() === "" ? 0 : Number(raw));
    const dayValues = {
      returnWindowDays: dayCount(returnWindow),
      handlingTimeMinDays: dayCount(handlingMin),
      handlingTimeMaxDays: dayCount(handlingMax),
      transitTimeMinDays: dayCount(transitMin),
      transitTimeMaxDays: dayCount(transitMax),
    };
    if (!Object.values(dayValues).every((n) => Number.isInteger(n) && n >= 0)) {
      toast.error("Day counts must be whole numbers.");
      return;
    }

    setSaving(true);
    const result = await saveStoreSettingsAction({
      codEnabled: form.codEnabled,
      guestCheckoutEnabled: form.guestCheckoutEnabled,
      shippingCharge: charge,
      freeShippingThreshold: threshold,
      giftWrapEnabled: form.giftWrapEnabled,
      giftWrapCharge: wrap,
      returnShippingPaidBy: form.returnShippingPaidBy,
      ...dayValues,
    });
    setSaving(false);

    if (result.ok) toast.success("Settings saved.");
    else toast.error(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <section>
        <h2 className="label-eyebrow mb-1">Checkout</h2>

        <ToggleRow
          id="codEnabled"
          label="Cash on delivery"
          description="Offer COD as a payment method at checkout. Turning this off stops new COD orders only — orders already placed as COD are unaffected."
          checked={form.codEnabled}
          onChange={(codEnabled) => setForm((f) => ({ ...f, codEnabled }))}
          disabled={saving}
        />

        <ToggleRow
          id="guestCheckoutEnabled"
          label="Guest checkout"
          description="Let shoppers order without an account. Turning this off asks them to sign in at checkout; their cart is kept."
          checked={form.guestCheckoutEnabled}
          onChange={(guestCheckoutEnabled) => setForm((f) => ({ ...f, guestCheckoutEnabled }))}
          disabled={saving}
        />
      </section>

      <section className="mt-10">
        <h2 className="label-eyebrow mb-1">Shipping</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Applied to new orders. Orders already placed keep the charge they were
          quoted.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="shippingCharge">Shipping charge (₹)</Label>
            <Input
              id="shippingCharge"
              inputMode="decimal"
              value={shippingCharge}
              onChange={(e) => setShippingCharge(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">Set to 0 for free shipping on every order.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="freeShippingThreshold">Free above (₹)</Label>
            <Input
              id="freeShippingThreshold"
              inputMode="decimal"
              value={freeThreshold}
              onChange={(e) => setFreeThreshold(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Orders at or above this subtotal ship free.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="label-eyebrow mb-1">Gifting</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Applied to new orders. Orders already placed keep the charge they were
          quoted.
        </p>

        <ToggleRow
          id="giftWrapEnabled"
          label="Gift wrap"
          description="Offer gift wrapping and a printed message card at checkout. The message is always free; only the wrap is charged."
          checked={form.giftWrapEnabled}
          onChange={(giftWrapEnabled) => setForm((f) => ({ ...f, giftWrapEnabled }))}
          disabled={saving}
        />

        {/* Hidden when the option is off — a price for something not on sale is
            a question with no answer, and leaving it visible invites setting it
            to something prohibitive as a way of switching the feature off. That
            is what the toggle above is for. */}
        {form.giftWrapEnabled && (
          <div className="mt-5 max-w-[16rem] space-y-1.5">
            <Label htmlFor="giftWrapCharge">Gift wrap charge (₹)</Label>
            <Input
              id="giftWrapCharge"
              inputMode="decimal"
              value={giftWrapCharge}
              onChange={(e) => setGiftWrapCharge(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              {/* ⚠️  No competitor names in shipped copy. This read "GIVA
                  charges ₹50 for the same thing" — which puts another shop's
                  name in this one's admin panel, and goes stale the moment they
                  reprice. The reasoning behind the ₹50 default belongs in the
                  code comment on STORE_SETTING_DEFAULTS, not on screen. */}
              Set to 0 to wrap for free.
            </p>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="label-eyebrow mb-1">Returns &amp; delivery</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          These are published to Google, and are what it shows next to the shop
          in search results. Leave a field at 0 and nothing is published for it —
          the shop simply makes no claim. Only fill these in once the policy is
          decided, and keep them in step with the returns wording in the CMS.
        </p>

        <div className="grid gap-5 sm:grid-cols-2">
          <DayField
            id="returnWindowDays"
            label="Return window (days)"
            hint="Days after delivery a piece can be sent back. 0 publishes no return policy at all."
            value={returnWindow}
            onChange={setReturnWindow}
            disabled={saving}
          />
        </div>

        {/* Only asked once a window exists — who pays to post back a return
            nobody accepts is a question with no answer. Same reasoning as the
            gift wrap charge above. */}
        {Number(returnWindow) > 0 && (
          <ToggleRow
            id="returnShippingPaidBy"
            label="Shop pays return postage"
            description="On: returns are free for the shopper. Off: they pay to post the item back. This appears in search results, so it should match what the returns page says."
            checked={form.returnShippingPaidBy === "merchant"}
            onChange={(merchant) =>
              setForm((f) => ({
                ...f,
                returnShippingPaidBy: merchant ? "merchant" : "customer",
              }))
            }
            disabled={saving}
          />
        )}

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <DayField
            id="handlingTimeMinDays"
            label="Dispatch within — from (days)"
            value={handlingMin}
            onChange={setHandlingMin}
            disabled={saving}
          />
          <DayField
            id="handlingTimeMaxDays"
            label="Dispatch within — to (days)"
            value={handlingMax}
            onChange={setHandlingMax}
            disabled={saving}
          />
          <DayField
            id="transitTimeMinDays"
            label="Delivery takes — from (days)"
            value={transitMin}
            onChange={setTransitMin}
            disabled={saving}
          />
          <DayField
            id="transitTimeMaxDays"
            label="Delivery takes — to (days)"
            value={transitMax}
            onChange={setTransitMax}
            disabled={saving}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Dispatch is how long a piece sits with the shop; delivery is time in
          transit after that. Any of the four left at 0 and no delivery estimate
          is published.
        </p>
      </section>

      <Button type="submit" disabled={saving} className="mt-8">
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
