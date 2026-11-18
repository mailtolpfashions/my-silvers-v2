"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FormSaveBar } from "@/components/layout/form-save-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveStoreSettingsAction } from "@/actions/admin-settings-actions";

export type StoreSettingsFormValues = {
  codEnabled: boolean;
  guestCheckoutEnabled: boolean;
  giftWrapEnabled: boolean;
  giftWrapCharge: number;
  codCharge: number;
  /** Whole days. Zero throughout means "not stated" — see the section copy. */
  returnWindowDays: number;
  returnRequestHours: number;
  returnShippingPaidBy: "customer" | "merchant";
  /** As stored ("919876543210") or "" — shown to the owner without the 91. */
  whatsappNumber: string;
};

/** A published collection, as offered in the "Shop for" picker. */

/** Each settings group's card — the same treatment as the product form's sections. */
const CARD = "rounded-lg border bg-background p-5";

/**
 * A labelled switch with the sentence explaining what it does.
 *
 * The description is not decoration here. "Cash on delivery" as a bare toggle
 * does not tell the person flipping it that existing COD orders are unaffected,
 * and that is exactly the thing they will worry about before touching it.
 */
export function ToggleRow({
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
export function DayField({
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
  const [giftWrapCharge, setGiftWrapCharge] = useState(String(initial.giftWrapCharge));
  const [codCharge, setCodCharge] = useState(String(initial.codCharge));

  /** Same reasoning as the money fields above: raw strings, parsed on submit. */
  const [returnWindow, setReturnWindow] = useState(String(initial.returnWindowDays));
  const [returnHours, setReturnHours] = useState(String(initial.returnRequestHours));

  /** Shown as the 10 digits people recognise; the server adds the 91 back. */
  const [whatsapp, setWhatsapp] = useState(initial.whatsappNumber.replace(/^91(?=\d{10}$)/, ""));

  /**
   * Everything the form holds, as one string, so "is anything unsaved?" is a
   * comparison against the last saved copy — it drives the save bar's
   * "Unsaved changes" line.
   */
  const snapshot = JSON.stringify([
    form, giftWrapCharge, codCharge, returnWindow, returnHours, whatsapp,
  ]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const wrap = Number(giftWrapCharge);
    // Empty reads as 0 — free COD — rather than an error.
    const cod = codCharge.trim() === "" ? 0 : Number(codCharge);
    if (!Number.isFinite(wrap) || !Number.isFinite(cod) || cod < 0) {
      toast.error("Amounts must be numbers.");
      return;
    }

    // An empty day field reads as "not stated", which is what 0 means here — so
    // clearing one is a legitimate way to withdraw the claim, not an error.
    const dayCount = (raw: string) => (raw.trim() === "" ? 0 : Number(raw));
    const dayValues = {
      returnWindowDays: dayCount(returnWindow),
      // Same rule: empty is 0, which here means no time limit.
      returnRequestHours: dayCount(returnHours),
    };
    if (!Object.values(dayValues).every((n) => Number.isInteger(n) && n >= 0)) {
      toast.error("Days and hours must be whole numbers.");
      return;
    }

    setSaving(true);
    const result = await saveStoreSettingsAction({
      codEnabled: form.codEnabled,
      guestCheckoutEnabled: form.guestCheckoutEnabled,
      giftWrapEnabled: form.giftWrapEnabled,
      giftWrapCharge: wrap,
      codCharge: cod,
      returnShippingPaidBy: form.returnShippingPaidBy,
      ...dayValues,
      whatsappNumber: whatsapp,
    });
    setSaving(false);

    if (result.ok) {
      setSavedSnapshot(snapshot);
      toast.success("Settings saved.");
    } else toast.error(result.error);
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Two columns of cards from xl up, matching the product form: what
          happens at the till (checkout, gifting) on the left, what the shop
          publishes about itself (returns) on the right. Below xl they stack
          in that order. Pricing has its own page; the header menu is in
          Studio. */}
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
      <div className="space-y-6">
      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">Checkout</h2>

        <ToggleRow
          id="codEnabled"
          label="Cash on delivery"
          description="Offer COD as a payment method at checkout. Turning this off stops new COD orders only — orders already placed as COD are unaffected."
          checked={form.codEnabled}
          onChange={(codEnabled) => setForm((f) => ({ ...f, codEnabled }))}
          disabled={saving}
        />

        {/* Hidden while COD is off, like the gift wrap price — a charge for a
            method nobody can choose is a question with no answer. */}
        {form.codEnabled && (
          <div className="mb-5 ml-0 max-w-[16rem] space-y-1.5">
            <Label htmlFor="codCharge">COD charge (₹)</Label>
            <Input
              id="codCharge"
              inputMode="decimal"
              value={codCharge}
              onChange={(e) => setCodCharge(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Added to cash-on-delivery orders as its own line at checkout. Set to 0 for free COD.
              Orders already placed keep what they were charged.
            </p>
          </div>
        )}

        <ToggleRow
          id="guestCheckoutEnabled"
          label="Guest checkout"
          description="Let shoppers order without an account. Turning this off asks them to sign in at checkout; their cart is kept."
          checked={form.guestCheckoutEnabled}
          onChange={(guestCheckoutEnabled) => setForm((f) => ({ ...f, guestCheckoutEnabled }))}
          disabled={saving}
        />
      </section>

      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">WhatsApp</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Your business WhatsApp number. Customers see a WhatsApp button on every product page,
          in the footer, the mobile menu and the order-tracking page. Leave it empty to hide
          them all.
        </p>
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="whatsappNumber">Mobile number</Label>
          <Input
            id="whatsappNumber"
            inputMode="tel"
            placeholder="98765 43210"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">10 digits — India (+91) is added for you.</p>
        </div>
      </section>

      {/* Rounding moved to the Pricing card below (components/admin/
          pricing-settings.tsx), with costs and margins — one pipeline, one
          place. */}

      <section className={CARD}>
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

      </div>

      <div className="space-y-6">
      <section className={CARD}>
        <h2 className="label-eyebrow mb-1">Returns</h2>

        <div className="mb-6 max-w-[16rem] space-y-1.5">
          <Label htmlFor="returnRequestHours">Time to request a return (hours)</Label>
          <Input
            id="returnRequestHours"
            inputMode="numeric"
            value={returnHours}
            onChange={(e) => setReturnHours(e.target.value)}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            Counted from delivery. After this, customers no longer see Request return on their
            order. The shipped and delivered emails quote it. 0 means no limit.
          </p>
        </div>

        <p className="mb-5 text-sm text-muted-foreground">
          The fields below are published to Google, and are what it shows next to the shop
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

        <p className="mt-4 text-xs text-muted-foreground">
          Dispatch and delivery times are on the{" "}
          <Link href="/admin/courier" className="underline">Courier</Link> page.
        </p>
      </section>

      </div>
      </div>

      {/* Sticky at the foot of the screen while the settings scroll — the old
          button sat below two long columns, out of sight while editing. */}
      <FormSaveBar dirty={snapshot !== savedSnapshot} saving={saving} saveLabel="Save settings" />
    </form>
  );
}
