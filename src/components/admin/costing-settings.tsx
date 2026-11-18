"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCostingDefaultsAction } from "@/actions/costing-actions";
import type { CostingDefaults } from "@/lib/costing";

const FIELDS: Array<{ key: keyof CostingDefaults; label: string; hint: string }> = [
  { key: "silverRatePerGram", label: "Silver rate (₹ per gram)", hint: "Today's rate. Update it when the rate moves — new costings use it." },
  { key: "makingChargePerGram", label: "Making charge (₹ per gram)", hint: "Your usual making charge. A product can set its own." },
  { key: "packingCost", label: "Packing (₹ per order)", hint: "Box, pouch, card, tape." },
  { key: "deliveryCost", label: "Delivery you pay (₹ per order)", hint: "What the courier costs you that the customer doesn't pay — e.g. on free-shipping orders." },
  { key: "gatewayPercent", label: "Payment gateway (%)", hint: "Razorpay's cut of each online payment, about 2%." },
  { key: "gstPercent", label: "GST on jewellery (%)", hint: "3% for silver jewellery (HSN 7113)." },
  { key: "targetMarginPercent", label: "Target margin (%)", hint: "Profit you aim to keep, as a share of the price before GST." },
];

/**
 * Settings → Costing: the shop-wide figures behind the product costing
 * calculator. Owner only — the Settings page itself is owner-only, and the
 * save action re-checks. Its own save button: these are numbers about the
 * business, unrelated to the shop switches above.
 */
export function CostingSettings({ initial }: { initial: CostingDefaults }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, String(initial[f.key])])) as Record<keyof CostingDefaults, string>
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = Object.fromEntries(
      FIELDS.map((f) => [f.key, values[f.key].trim() === "" ? 0 : Number(values[f.key])])
    );
    if (Object.values(parsed).some((n) => !Number.isFinite(n) || n < 0)) {
      toast.error("Costing figures must be numbers, 0 or more.");
      return;
    }
    setSaving(true);
    const result = await saveCostingDefaultsAction(parsed);
    setSaving(false);
    if (result.ok) toast.success("Costing defaults saved.");
    else toast.error(result.error);
  }

  return (
    <section id="costing" className="scroll-mt-24 rounded-lg border p-5">
      <h2 className="label-eyebrow mb-1">Costing</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        The figures behind the costing calculator on each product. Owner only — staff never see
        costs or margins, and none of this reaches the shop.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`costing-default-${f.key}`}>{f.label}</Label>
            <Input
              id={`costing-default-${f.key}`}
              inputMode="decimal"
              value={values[f.key]}
              disabled={saving}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{f.hint}</p>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save costing"}
        </Button>
      </div>
    </section>
  );
}
