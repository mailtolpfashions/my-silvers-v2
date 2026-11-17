"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { StickyActions } from "@/components/layout/sticky-actions";
import { saveCourierSettingsAction } from "@/actions/admin-courier-actions";

type PartnerId = "shiprocket" | "nimbuspost";
const LABEL: Record<PartnerId, string> = { shiprocket: "Shiprocket", nimbuspost: "NimbusPost" };

export type PartnerFact = { label: string; value: string; tone: "ok" | "bad" | "muted" };

/** What a partner card shows: its at-a-glance status and the set-up behind Manage. */
export type PartnerPanel = {
  connected: boolean;
  facts: PartnerFact[];
  /** One line on what stops it working right now, if anything. */
  warning: string | null;
  /** The partner's set-up (pickup, tracking), opened in a side panel. */
  manage: React.ReactNode | null;
};

type Values = {
  courierPartners: Record<PartnerId, boolean>;
  /** Rupees — paise is the storage unit; the action converts. */
  shippingCharge: number;
  freeShippingThreshold: number;
  handlingTimeMinDays: number;
  handlingTimeMaxDays: number;
  transitTimeMinDays: number;
  transitTimeMaxDays: number;
};

const TONE = {
  ok: "text-green-700",
  bad: "text-destructive",
  muted: "text-muted-foreground",
} as const;

/**
 * The Courier page, laid out to fit about one screen:
 *
 *   ┌ Shiprocket ─────────┐ ┌ NimbusPost ─────────┐   partner cards: switch,
 *   │ status grid  Manage │ │ status grid  Manage │   status, set-up behind
 *   └─────────────────────┘ └─────────────────────┘   Manage (a side panel)
 *   ┌ Shipping charges ───┐ ┌ Dispatch & delivery ┐
 *   └─────────────────────┘ └─────────────────────┘
 *
 * It used to stack every set-up form in one long column, so the two things
 * looked at most — is each partner on, and is it healthy — were a scroll
 * apart, with forms used once in between. Set-up now opens only when asked.
 *
 * Money and day fields are held as the raw STRING typed (a number snaps "" to
 * 0, so a field could never be cleared to retype). Parsed on save.
 */
export function CourierSettingsForm({
  initial,
  partners,
}: {
  initial: Values;
  partners: Record<PartnerId, PartnerPanel>;
}) {
  const [on, setOn] = useState(initial.courierPartners);
  const [charge, setCharge] = useState(String(initial.shippingCharge));
  const [threshold, setThreshold] = useState(String(initial.freeShippingThreshold));
  const [handlingMin, setHandlingMin] = useState(String(initial.handlingTimeMinDays));
  const [handlingMax, setHandlingMax] = useState(String(initial.handlingTimeMaxDays));
  const [transitMin, setTransitMin] = useState(String(initial.transitTimeMinDays));
  const [transitMax, setTransitMax] = useState(String(initial.transitTimeMaxDays));
  const [saving, setSaving] = useState(false);

  const snapshot = JSON.stringify([on, charge, threshold, handlingMin, handlingMax, transitMin, transitMax]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;

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
      courierPartners: on,
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

  const bothOn = (["shiprocket", "nimbuspost"] as const).every((p) => partners[p].connected && on[p]);

  return (
    <form onSubmit={save} className="max-w-6xl space-y-6">
      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Courier partners</h2>
          <p className="text-xs text-muted-foreground">
            {bothOn
              ? "Both on — Ship order compares their prices and picks the cheapest."
              : "Switch both on to compare prices and pick the cheapest."}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(["shiprocket", "nimbuspost"] as const).map((p) => (
            <PartnerCard
              key={p}
              id={p}
              panel={partners[p]}
              enabled={partners[p].connected && on[p]}
              onToggle={(v) => setOn((cur) => ({ ...cur, [p]: v }))}
              disabled={saving}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border bg-background p-5">
          <h2 className="text-sm font-semibold">Shipping charges</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">What shoppers pay at checkout, on new orders.</p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field id="shippingCharge" label="Charge (₹)" value={charge} onChange={setCharge} hint="0 = always free" disabled={saving} decimal />
            <Field id="freeShippingThreshold" label="Free above (₹)" value={threshold} onChange={setThreshold} hint="Order subtotal" disabled={saving} decimal />
          </div>
        </section>

        <section className="rounded-lg border bg-background p-5">
          <h2 className="text-sm font-semibold">Dispatch &amp; delivery (days)</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The expected date in emails and on Google. All 0 = no estimate shown.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <RangeField label="Dispatch" from={handlingMin} to={handlingMax} setFrom={setHandlingMin} setTo={setHandlingMax} disabled={saving} />
            <RangeField label="In transit" from={transitMin} to={transitMax} setFrom={setTransitMin} setTo={setTransitMax} disabled={saving} />
          </div>
        </section>
      </div>

      <StickyActions className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <Button type="submit" size="sm" disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </StickyActions>
    </form>
  );
}

function PartnerCard({
  id,
  panel,
  enabled,
  onToggle,
  disabled,
}: {
  id: PartnerId;
  panel: PartnerPanel;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  disabled: boolean;
}) {
  const name = LABEL[id];
  return (
    <section className={`rounded-lg border bg-background p-5 ${enabled ? "" : "opacity-90"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{name}</h3>
          <p className={`text-xs ${enabled ? "text-green-700" : "text-muted-foreground"}`}>
            {!panel.connected ? "Not connected" : enabled ? "In use for shipping" : "Switched off"}
          </p>
        </div>
        <Switch
          aria-label={`Use ${name} for shipping`}
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={disabled || !panel.connected}
        />
      </div>

      {panel.connected ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {panel.facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className={`truncate text-sm font-medium ${TONE[f.tone]}`} title={f.value}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Add the {name} API keys in Vercel and redeploy to connect.
        </p>
      )}

      {panel.warning && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{panel.warning}</p>
      )}

      {panel.manage && (
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="mt-4">
              <Settings2 className="size-4" aria-hidden />
              Manage {name}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
            <SheetHeader className="border-b">
              <SheetTitle>{name}</SheetTitle>
              <SheetDescription>Pickup location and tracking updates.</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-8">{panel.manage}</div>
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  disabled,
  decimal,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  disabled?: boolean;
  decimal?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} inputMode={decimal ? "decimal" : "numeric"} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** "Dispatch: [2] to [3]" — a from/to pair on one line. */
function RangeField({
  label,
  from,
  to,
  setFrom,
  setTo,
  disabled,
}: {
  label: string;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  disabled?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="col-span-2 space-y-1 sm:col-span-1">
      <Label htmlFor={`${id}-from`} className="text-xs">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input id={`${id}-from`} aria-label={`${label} from`} inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} disabled={disabled} className="w-16" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input id={`${id}-to`} aria-label={`${label} to`} inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} disabled={disabled} className="w-16" />
      </div>
    </div>
  );
}
