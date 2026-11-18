"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculatedPrice, costBreakdown, profitAt, suggestedPrice, type CostingDefaults } from "@/lib/costing";
import { charmPrice, type CharmDirection, type CharmStyle } from "@/lib/charm-price";
import { formatINR } from "@/lib/format";

/** Raw strings as typed — parsed for the sums, sent as numbers on save. */
export type CostingFields = { weight: string; rate: string; making: string };

export type CostingContext = {
  defaults: CostingDefaults;
  /** The shop's charm rule (the Pricing page), or null when rounding is off. */
  charm: { style: CharmStyle; direction: CharmDirection } | null;
};

const num = (s: string): number | null => {
  const n = Number(s);
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};

/**
 * The automatic price for what is typed — cost → margin band → rounding — or
 * null until weight, rate and making charge are all there. The same function
 * the server uses on save (lib/costing.ts calculatedPrice), so the figure in
 * the Price field is the one that gets saved.
 */
export function autoPrice(ctx: CostingContext, fields: CostingFields, mrp: string): number | null {
  const b = costBreakdown(
    { weightGrams: num(fields.weight), silverRatePerGram: num(fields.rate), makingChargePerGram: num(fields.making) },
    ctx.defaults
  );
  return b ? (calculatedPrice(b, ctx.defaults, ctx.charm, charmPrice, num(mrp))?.price ?? null) : null;
}

/**
 * What the form sends: undefined = untouched, null = cleared (no weight), else
 * the values. A weight with the rate or making charge missing is an error the
 * form reports before saving — see costingProblem.
 */
export function costingPayload(
  fields: CostingFields,
  initial: CostingFields,
  manualPrice: boolean,
  initialManual: boolean
) {
  if (JSON.stringify(fields) === JSON.stringify(initial) && manualPrice === initialManual) return undefined;
  const weight = num(fields.weight);
  if (!weight || weight <= 0) return null;
  return {
    weightGrams: weight,
    silverRatePerGram: num(fields.rate) ?? 0,
    makingChargePerGram: num(fields.making) ?? 0,
    manualPrice,
  };
}

/** Why the costing can't be saved as it stands, or null when it can. */
export function costingProblem(fields: CostingFields): string | null {
  const weight = num(fields.weight);
  if (!weight) return null; // no costing at all is fine
  if (!(num(fields.rate) ?? 0)) return "Costing: enter the silver rate this piece was bought at.";
  if (num(fields.making) === null) return "Costing: enter the making charge (0 if there is none).";
  return null;
}

/**
 * The owner's costing calculator, inside the product form.
 *
 * Only ever rendered for the owner — the page passes the costing context only
 * when the viewer is the owner, and the save action ignores costing from
 * anyone else. The silver rate and making charge are THIS piece's, fixed when
 * its batch was bought; see lib/costing.ts for why nothing here is global.
 */
export function CostingPanel({
  ctx,
  fields,
  onFields,
  price,
  mrp,
  disabled,
}: {
  ctx: CostingContext;
  fields: CostingFields;
  onFields: (next: CostingFields) => void;
  /** The Price field as typed. */
  price: string;
  /** The Compare-at price (MRP) — rounding never reaches it. */
  mrp: string;
  disabled?: boolean;
}) {
  const d = ctx.defaults;
  const b = costBreakdown(
    { weightGrams: num(fields.weight), silverRatePerGram: num(fields.rate), makingChargePerGram: num(fields.making) },
    d
  );

  const suggestion = b ? suggestedPrice(b, d) : null;
  const rounded =
    suggestion && ctx.charm
      ? charmPrice(suggestion.price, ctx.charm.style, ctx.charm.direction, num(mrp))
      : (suggestion?.price ?? null);
  const atSuggested = b && rounded !== null ? profitAt(rounded, b, d) : null;
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
        <span className="text-xs text-muted-foreground">Never shown to customers</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {field("weight", "Silver weight (g)", "e.g. 4.5")}
        {field("rate", "Silver rate bought at (₹/g)", "e.g. 105")}
        {field("making", "Making charge (₹/g)", "e.g. 20")}
      </div>

      {!b ? (
        <p className="text-xs text-muted-foreground">
          Enter this piece&apos;s weight, the silver rate you bought its batch at, and its making
          charge. Packing, delivery, fees and margins come from{" "}
          <Link href="/admin/pricing" className="underline">
            the Pricing page
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

          {!suggestion || rounded === null ? (
            <p className="text-destructive">
              These margins aren&apos;t possible with the fees in Settings — lower a margin there.
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted px-3 py-2">
              <div>
                <p>
                  Calculated price: <strong>{formatINR(rounded)}</strong>
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {suggestion.band}
                    {suggestion.targetPercent !== null ? `, ${suggestion.targetPercent}% margin` : ""}
                    {rounded !== suggestion.price ? ` · rounded from ${formatINR(suggestion.price)}` : ""}
                  </span>
                </p>
                {atSuggested && (
                  <p className="text-xs text-muted-foreground">
                    Incl. GST {formatINR(atSuggested.gst)} · gateway {formatINR(atSuggested.gateway)} · profit{" "}
                    {formatINR(atSuggested.profit)} ({atSuggested.marginPercent}%)
                  </p>
                )}
              </div>
            </div>
          )}

          {atCurrent && current !== rounded && (
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
