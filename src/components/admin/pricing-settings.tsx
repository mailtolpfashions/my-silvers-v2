"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyRecalculationAction,
  previewRecalculationAction,
  savePricingSettingsAction,
} from "@/actions/costing-actions";
import { calculatedPrice, costBreakdown, profitAt, type CostingDefaults } from "@/lib/costing";
import {
  CHARM_DIRECTIONS,
  CHARM_STYLES,
  charmPrice,
  type CharmDirection,
  type CharmStyle,
} from "@/lib/charm-price";
import { formatINR } from "@/lib/format";

type NumKey = "packingCost" | "deliveryCost" | "gatewayPercent" | "gstPercent" | "under1k" | "upTo10k" | "over10k";

const COSTS: Array<{ key: NumKey; label: string; hint: string }> = [
  { key: "packingCost", label: "Packing (₹ per order)", hint: "Box, pouch, card, tape." },
  { key: "deliveryCost", label: "Delivery you pay (₹ per order)", hint: "Courier cost you don't recover — e.g. on free-shipping orders." },
  { key: "gatewayPercent", label: "Payment gateway (%)", hint: "Razorpay's cut, about 2%." },
  { key: "gstPercent", label: "GST on jewellery (%)", hint: "3% for silver jewellery (HSN 7113)." },
];

const MARGINS: Array<{ key: NumKey; label: string }> = [
  { key: "under1k", label: "Price under ₹1,000" },
  { key: "upTo10k", label: "₹1,000 – ₹10,000" },
  { key: "over10k", label: "Above ₹10,000" },
];

type Preview = { sample: Array<{ id: string; sku: string; name: string; from: number; to: number }>; total: number; manual: number };

/**
 * the Pricing page: everything a price is built from, in the order it is
 * built — ① costs of selling, ② margin by price band, ③ rounding — with a
 * live example, and Recalculate for prices already saved. Owner only (the
 * Settings page is owner-only; every action re-checks).
 *
 * The silver rate and making charge are not here: they are each product's,
 * fixed when its batch was bought (lib/costing.ts).
 */
export function PricingSettings({
  costing,
  charmPricing,
  charmDirection,
}: {
  costing: CostingDefaults;
  charmPricing: "off" | CharmStyle;
  charmDirection: CharmDirection;
}) {
  const [values, setValues] = useState<Record<NumKey, string>>({
    packingCost: String(costing.packingCost),
    deliveryCost: String(costing.deliveryCost),
    gatewayPercent: String(costing.gatewayPercent),
    gstPercent: String(costing.gstPercent),
    under1k: String(costing.margins.under1k),
    upTo10k: String(costing.margins.upTo10k),
    over10k: String(costing.margins.over10k),
  });
  const [style, setStyle] = useState<"off" | CharmStyle>(charmPricing);
  const [direction, setDirection] = useState<CharmDirection>(charmDirection);
  const [example, setExample] = useState({ weight: "4", rate: "105", making: "20" });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [recalcOpen, setRecalcOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const n = (k: NumKey) => (values[k].trim() === "" ? 0 : Number(values[k]));
  const defaults: CostingDefaults = {
    packingCost: n("packingCost"),
    deliveryCost: n("deliveryCost"),
    gatewayPercent: n("gatewayPercent"),
    gstPercent: n("gstPercent"),
    margins: { under1k: n("under1k"), upTo10k: n("upTo10k"), over10k: n("over10k") },
  };
  const valid = Object.values(values).every((v) => v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) >= 0));

  // The live example — the same functions the form, the import and
  // Recalculate use, so what it shows is what a product would get.
  const b = valid
    ? costBreakdown(
        {
          weightGrams: Number(example.weight) || null,
          silverRatePerGram: Number(example.rate) || null,
          makingChargePerGram: example.making.trim() === "" ? null : Number(example.making),
        },
        defaults
      )
    : null;
  const result = b
    ? calculatedPrice(b, defaults, style === "off" ? null : { style, direction }, charmPrice)
    : null;
  const at = b && result ? profitAt(result.price, b, defaults) : null;

  async function save() {
    if (!valid) {
      toast.error("Pricing figures must be numbers, 0 or more.");
      return;
    }
    if (Object.values(defaults.margins).some((m) => m >= 95)) {
      toast.error("A margin must be under 95%.");
      return;
    }
    setSaving(true);
    const res = await savePricingSettingsAction({ costing: defaults, charmPricing: style, charmDirection: direction });
    setSaving(false);
    if (res.ok) toast.success("Pricing saved. Existing prices are unchanged — use Recalculate to update them.");
    else toast.error(res.error);
  }

  async function openRecalc() {
    setPreview(null);
    setRecalcOpen(true);
    const res = await previewRecalculationAction();
    if (res.ok) setPreview(res);
    else toast.error(res.error);
  }

  async function applyRecalc() {
    setApplying(true);
    const res = await applyRecalculationAction();
    setApplying(false);
    if (res.ok) {
      toast.success(res.count === 0 ? "Every price was already up to date." : `${res.count} price${res.count === 1 ? "" : "s"} updated.`);
      setRecalcOpen(false);
    } else toast.error(res.error);
  }

  const numberInput = (key: NumKey, label: string, hint?: string) => (
    <div key={key} className="space-y-1.5">
      <Label htmlFor={`pricing-${key}`}>{label}</Label>
      <Input
        id={`pricing-${key}`}
        inputMode="decimal"
        value={values[key]}
        disabled={saving}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <section id="pricing" className="scroll-mt-24 space-y-6 rounded-lg border p-5">
      <div>
        <p className="text-sm text-muted-foreground">
          How a costed product&apos;s price is worked out: its cost (weight × the silver rate its batch
          was bought at + making charge), then the margin for its price band, then rounding. Enter
          weight and making charge on a product or in the CSV, and the price follows. Owner only — none
          of this reaches the shop.
        </p>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">① Costs of selling</h3>
        <div className="grid gap-5 sm:grid-cols-2">{COSTS.map((f) => numberInput(f.key, f.label, f.hint))}</div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium">② Margin by selling price (%)</h3>
        <p className="mb-3 text-xs text-muted-foreground">Profit as a share of the price before GST.</p>
        <div className="grid gap-5 sm:grid-cols-3">{MARGINS.map((f) => numberInput(f.key, f.label))}</div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">③ Rounding</h3>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2" role="radiogroup" aria-label="Ending">
            {[{ value: "off" as const, label: "Off", example: "Prices saved exactly as worked out or typed" }, ...CHARM_STYLES].map((o) => (
              <label key={o.value} className="flex items-start gap-2 text-sm">
                <input type="radio" name="pricing-style" className="mt-1" checked={style === o.value} disabled={saving} onChange={() => setStyle(o.value)} />
                <span>
                  {o.label}
                  <span className="block text-xs text-muted-foreground">{o.example}</span>
                </span>
              </label>
            ))}
          </div>
          {style !== "off" && (
            <div className="space-y-2" role="radiogroup" aria-label="Which way">
              {CHARM_DIRECTIONS.map((o) => (
                <label key={o.value} className="flex items-start gap-2 text-sm">
                  <input type="radio" name="pricing-direction" className="mt-1" checked={direction === o.value} disabled={saving} onChange={() => setDirection(o.value)} />
                  <span>
                    {o.label}
                    <span className="block text-xs text-muted-foreground">{o.example}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Also applies to prices you type yourself. Never reaches a product&apos;s MRP, and never moves a price more than 10%.
        </p>
      </div>

      <div className="rounded-md bg-muted p-4 text-sm">
        <p className="mb-3 font-medium">Try it</p>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          {(
            [
              ["weight", "Weight (g)"],
              ["rate", "Silver ₹/g"],
              ["making", "Making ₹/g"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="w-28 space-y-1">
              <Label htmlFor={`pricing-example-${k}`} className="text-xs">
                {label}
              </Label>
              <Input
                id={`pricing-example-${k}`}
                inputMode="decimal"
                value={example[k]}
                onChange={(e) => setExample((x) => ({ ...x, [k]: e.target.value }))}
                className="bg-background"
              />
            </div>
          ))}
        </div>
        {!b || !result || !at ? (
          <p className="text-muted-foreground">Enter a weight, rate and making charge to see the price.</p>
        ) : (
          <p className="leading-relaxed">
            Cost {formatINR(b.purchase)} + packing &amp; delivery {formatINR(b.packing + b.delivery)} →{" "}
            {formatINR(result.suggestion.price)} ({result.suggestion.band}
            {result.suggestion.targetPercent !== null ? `, ${result.suggestion.targetPercent}%` : ""})
            {result.price !== result.suggestion.price && <> → rounded {formatINR(result.price)}</>}
            <br />
            <strong>Price {formatINR(result.price)}</strong> · profit {formatINR(at.profit)} ({at.marginPercent}%) after GST{" "}
            {formatINR(at.gst)} and gateway {formatINR(at.gateway)}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save pricing"}
        </Button>
        <Button variant="outline" onClick={openRecalc} disabled={saving}>
          Recalculate prices…
        </Button>
        <p className="text-xs text-muted-foreground">
          Saving never changes existing prices. Recalculate updates costed products to the saved rules, after a preview.
        </p>
      </div>

      <Dialog open={recalcOpen} onOpenChange={setRecalcOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Recalculate prices</DialogTitle>
            <DialogDescription>
              Re-prices every costed product with an automatic price, using the pricing saved now
              (save first if you just changed it). Prices you typed yourself are left alone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 text-sm">
            {preview === null ? (
              <p className="text-muted-foreground">Working out the new prices…</p>
            ) : preview.total === 0 ? (
              <p>Every automatic price already matches the current pricing.</p>
            ) : (
              <>
                <ul className="space-y-1">
                  {preview.sample.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3">
                      <span className="truncate">
                        <code className="text-xs">{c.sku}</code> {c.name}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatINR(c.from)} → <strong>{formatINR(c.to)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
                {preview.total > preview.sample.length && (
                  <p className="mt-2 text-xs text-muted-foreground">…and {preview.total - preview.sample.length} more.</p>
                )}
              </>
            )}
            {preview && preview.manual > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {preview.manual} product{preview.manual === 1 ? " has" : "s have"} a price you typed — not changed.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecalcOpen(false)} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={applyRecalc} disabled={applying || !preview || preview.total === 0}>
              {applying ? "Updating…" : preview && preview.total > 0 ? `Update ${preview.total} price${preview.total === 1 ? "" : "s"}` : "Update prices"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
