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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const charge = Number(shippingCharge);
    const threshold = Number(freeThreshold);
    const wrap = Number(giftWrapCharge);
    if (!Number.isFinite(charge) || !Number.isFinite(threshold) || !Number.isFinite(wrap)) {
      toast.error("Amounts must be numbers.");
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
              Set to 0 to wrap for free. GIVA charges ₹50 for the same thing.
            </p>
          </div>
        )}
      </section>

      <Button type="submit" disabled={saving} className="mt-8">
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
