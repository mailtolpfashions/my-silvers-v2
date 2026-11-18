"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  costBreakdown,
  profitAt,
  suggestedPrice,
  type CostingDefaults,
} from "@/lib/costing";
import { charmPrice, type CharmDirection, type CharmStyle } from "@/lib/charm-price";
import { formatINR } from "@/lib/format";

/** Raw strings as typed — parsed for the sums, sent as numbers on save. */
export type CostingFields = { weight: string; rate: string; making: string };

export type CostingContext = {
  defaults: CostingDefaults;
  /** The shop's charm rule (Settings → Pricing), or null when rounding is off. */
  charm: { style: CharmStyle; direction: CharmDirection } | null;
};

const num = (s: string): number | null => {
  const n = Number(s);
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};

/** What the form sends: undefined = untouched, null = cleared, else the values. */
export function costingPayload(fields: CostingFields, initial: CostingFields) {
  if (JSON.stringify(fields) === JSON.stringify(initial)) return undefined;
  const weight = num(fields.weight);
  if (!weight || weight <= 0) return null;
  return {
    weightGrams: weight,
    silverRatePerGram: num(fields.rate),
    makingChargePerGram: num(fields.making),
  };
}

/**
 * The owner's costing calculator, inside the product form.
 *
 * Only ever rendered for the owner — the page passes the costing context only
 * when the viewer is the owner, and the save action ignores costing from
 * anyone else. See lib/costing.ts for the arithmetic.
 */
export function CostingPanel({
  ctx,
  fields,
  onFields,
  price,
  mrp,
  onUsePrice,
  disabled,
}: {
  ctx: CostingContext;
  fields: CostingFields;
  onFields: (next: CostingFields) => void;
  /** The Price field as typed. */
  price: string;
  /** The Compare-at price (MRP) — rounding never reaches it. */
  mrp: string;
  onUsePrice: (price: number) => void;
  disabled?: boolean;
}) {
  const d = ctx.defaults;
  const b = costBreakdown(
    { weightGrams: num(fields.weight), silverRatePerGram: num(fields.rate), makingChargePerGram: num(fields.making) },
    d
  );

  const raw = b ? suggestedPrice(b, d) : null;
  const suggested =
    raw !== null && ctx.charm ? charmPrice(raw, ctx.charm.style, ctx.charm.direction, num(mrp)) : raw;
  const atSuggested = b && suggested !== null ? profitAt(suggested, b, d) : null;
  const current = num(price);
  const atCurrent = b && current && current > 0 ? profitAt(current, b, d) : null;

  const field = (key: keyof CostingFields, label: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`costing-${key}`}>{label}</Label>
      <Input
        id={`costing-${key}`}
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={fields[key]}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onFields({ ...fields, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="space-y-4 rounded-md border border-dashed p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Costing calculator</p>
        <span className="text-xs text-muted-foreground">Owner only · never shown to customers</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {field("weight", "Silver weight (g)", "e.g. 4.5")}
        {field("rate", "Silver rate (₹/g)", d.silverRatePerGram ? `${d.silverRatePerGram} (default)` : "Set in Settings")}
        {field("making", "Making (₹/g)", `${d.makingChargePerGram} (default)`)}
      </div>

      {!b ? (
        <p className="text-xs text-muted-foreground">
          {num(fields.weight) && !(num(fields.rate) ?? d.silverRatePerGram)
            ? "Enter the silver rate here, or set today's rate in "
            : "Enter the silver weight to see the cost and a suggested price. Defaults come from "}
          <Link href="/admin/settings#costing" className="underline">
            Settings → Costing
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">
              Silver {b.weightGrams} g × ₹{b.silverRate}
            </dt>
            <dd className="text-right tabular-nums">{formatINR(b.silver)}</dd>
            <dt className="text-muted-foreground">
              Making {b.weightGrams} g × ₹{b.makingCharge}
            </dt>
            <dd className="text-right tabular-nums">{formatINR(b.making)}</dd>
            <dt className="font-medium">Purchase cost (saved as Cost price)</dt>
            <dd className="text-right font-medium tabular-nums">{formatINR(b.purchase)}</dd>
            <dt className="text-muted-foreground">Packing + delivery</dt>
            <dd className="text-right tabular-nums">{formatINR(b.packing + b.delivery)}</dd>
          </dl>

          {suggested === null ? (
            <p className="text-destructive">
              A {d.targetMarginPercent}% margin isn&apos;t possible with these fees — lower it in Settings.
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted px-3 py-2">
              <div>
                <p>
                  For {d.targetMarginPercent}% margin: <strong>{formatINR(suggested)}</strong>
                  {ctx.charm && raw !== suggested && (
                    <span className="text-xs text-muted-foreground"> (rounded from {formatINR(raw!)})</span>
                  )}
                </p>
                {atSuggested && (
                  <p className="text-xs text-muted-foreground">
                    Incl. GST {formatINR(atSuggested.gst)} · gateway {formatINR(atSuggested.gateway)} · profit{" "}
                    {formatINR(atSuggested.profit)} ({atSuggested.marginPercent}%)
                  </p>
                )}
              </div>
              <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onUsePrice(suggested)}>
                Use {formatINR(suggested)}
              </Button>
            </div>
          )}

          {atCurrent && current !== suggested && (
            <p className={atCurrent.profit < 0 ? "text-destructive" : "text-muted-foreground"}>
              At the current price {formatINR(atCurrent.price)}: profit{" "}
              <strong>{formatINR(atCurrent.profit)}</strong> ({atCurrent.marginPercent}%)
              {atCurrent.profit < 0 && " — a loss on every sale"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
