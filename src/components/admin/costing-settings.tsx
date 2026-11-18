"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCostingDefaultsAction } from "@/actions/costing-actions";
import type { CostingDefaults } from "@/lib/costing";

type Key = "packingCost" | "deliveryCost" | "gatewayPercent" | "gstPercent" | "under1k" | "upTo10k" | "over10k";

const COSTS: Array<{ key: Key; label: string; hint: string }> = [
  { key: "packingCost", label: "Packing (₹ per order)", hint: "Box, pouch, card, tape." },
  { key: "deliveryCost", label: "Delivery you pay (₹ per order)", hint: "What the courier costs you that the customer doesn't pay — e.g. on free-shipping orders." },
  { key: "gatewayPercent", label: "Payment gateway (%)", hint: "Razorpay's cut of each online payment, about 2%." },
  { key: "gstPercent", label: "GST on jewellery (%)", hint: "3% for silver jewellery (HSN 7113)." },
];

const MARGINS: Array<{ key: Key; label: string }> = [
  { key: "under1k", label: "Price under ₹1,000" },
  { key: "upTo10k", label: "₹1,000 – ₹10,000" },
  { key: "over10k", label: "Above ₹10,000" },
];

/**
 * Settings → Costing: the shop-wide figures behind the costing calculator.
 * Owner only — the Settings page is owner-only and the action re-checks.
 *
 * No silver rate or making charge here, on purpose: those are fixed per
 * product when its batch is bought (lib/costing.ts explains why).
 */
export function CostingSettings({ initial }: { initial: CostingDefaults }) {
  const [values, setValues] = useState<Record<Key, string>>({
    packingCost: String(initial.packingCost),
    deliveryCost: String(initial.deliveryCost),
    gatewayPercent: String(initial.gatewayPercent),
    gstPercent: String(initial.gstPercent),
    under1k: String(initial.margins.under1k),
    upTo10k: String(initial.margins.upTo10k),
    over10k: String(initial.margins.over10k),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    const n = (k: Key) => (values[k].trim() === "" ? 0 : Number(values[k]));
    const all = (Object.keys(values) as Key[]).map(n);
    if (all.some((v) => !Number.isFinite(v) || v < 0)) {
      toast.error("Costing figures must be numbers, 0 or more.");
      return;
    }
    if ([n("under1k"), n("upTo10k"), n("over10k")].some((v) => v >= 95)) {
      toast.error("A margin must be under 95%.");
      return;
    }
    setSaving(true);
    const result = await saveCostingDefaultsAction({
      packingCost: n("packingCost"),
      deliveryCost: n("deliveryCost"),
      gatewayPercent: n("gatewayPercent"),
      gstPercent: n("gstPercent"),
      margins: { under1k: n("under1k"), upTo10k: n("upTo10k"), over10k: n("over10k") },
    });
    setSaving(false);
    if (result.ok) toast.success("Costing saved.");
    else toast.error(result.error);
  }

  const input = (key: Key, label: string, hint?: string) => (
    <div key={key} className="space-y-1.5">
      <Label htmlFor={`costing-${key}`}>{label}</Label>
      <Input
        id={`costing-${key}`}
        inputMode="decimal"
        value={values[key]}
        disabled={saving}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <section id="costing" className="scroll-mt-24 rounded-lg border p-5">
      <h2 className="label-eyebrow mb-1">Costing</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        The shop-wide figures behind the costing calculator. The silver rate and making charge are
        not here — they&apos;re set per product, at the rate you bought each batch. Owner only; none of
        this reaches the shop.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">{COSTS.map((f) => input(f.key, f.label, f.hint))}</div>

      <h3 className="mt-6 text-sm font-medium">Target margin by selling price (%)</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        The suggested price uses the margin for the band it falls in. Margin is profit as a share of
        the price before GST.
      </p>
      <div className="grid gap-5 sm:grid-cols-3">{MARGINS.map((f) => input(f.key, f.label))}</div>

      <div className="mt-5">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save costing"}
        </Button>
      </div>
    </section>
  );
}
