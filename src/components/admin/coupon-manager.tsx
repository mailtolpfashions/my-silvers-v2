"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  saveCouponAction,
  setCouponActiveAction,
  deleteCouponAction,
} from "@/actions/admin-coupon-actions";
// The same wording the shopper sees in "Available offers".
import { describeCoupon } from "@/lib/coupon-text";

export type CouponRow = {
  id: string;
  code: string;
  description: string;
  type: "percent" | "flat";
  value: number;
  minOrderValue: number | null;
  maxDiscount: number | null;
  /** yyyy-mm-dd in IST, "" when open-ended. */
  startsOn: string;
  endsOn: string;
  usageLimit: number | null;
  onePerCustomer: boolean;
  firstOrderOnly: boolean;
  /** Listed under "Available offers" in the cart and checkout. */
  showToShoppers: boolean;
  active: boolean;
  /** Orders that used it and were not cancelled or left unpaid. */
  used: number;
  /** Total discount given on those orders, in rupees. */
  given: number;
  status: "live" | "scheduled" | "expired" | "off" | "used up";
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const STATUS_VARIANT: Record<CouponRow["status"], "secondary" | "outline" | "destructive"> = {
  live: "secondary",
  scheduled: "outline",
  expired: "destructive",
  off: "destructive",
  "used up": "destructive",
};

function CouponFormDialog({ coupon, trigger }: { coupon: CouponRow | null; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: coupon?.code ?? "",
    description: coupon?.description ?? "",
    type: coupon?.type ?? ("percent" as "percent" | "flat"),
    value: coupon ? String(coupon.value) : "",
    minOrderValue: coupon?.minOrderValue != null ? String(coupon.minOrderValue) : "",
    maxDiscount: coupon?.maxDiscount != null ? String(coupon.maxDiscount) : "",
    startsOn: coupon?.startsOn ?? "",
    endsOn: coupon?.endsOn ?? "",
    usageLimit: coupon?.usageLimit != null ? String(coupon.usageLimit) : "",
    onePerCustomer: coupon?.onePerCustomer ?? true,
    firstOrderOnly: coupon?.firstOrderOnly ?? false,
    showToShoppers: coupon?.showToShoppers ?? true,
    active: coupon?.active ?? true,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const num = (s: string) => (s.trim() === "" ? "" : Number(s));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await saveCouponAction(coupon?.id ?? null, {
        ...form,
        value: Number(form.value),
        minOrderValue: num(form.minOrderValue),
        maxDiscount: num(form.maxDiscount),
        usageLimit: num(form.usageLimit),
      });
      if (result.ok) {
        toast.success(coupon ? "Coupon updated." : "Coupon created.");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{coupon ? `Edit ${coupon.code}` : "New coupon"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cp-code" required>Code</Label>
              <Input
                id="cp-code"
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s+/g, ""))}
                placeholder="LAUNCH10"
                className="uppercase"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-desc">Note (only you see this)</Label>
              <Input
                id="cp-desc"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Launch offer — Instagram"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cp-type">Discount type</Label>
              <select
                id="cp-type"
                value={form.type}
                onChange={(e) => set("type", e.target.value as "percent" | "flat")}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="percent">Percentage off</option>
                <option value="flat">Flat ₹ off</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-value" required>{form.type === "percent" ? "Percent off" : "Rupees off"}</Label>
              <Input
                id="cp-value"
                type="number"
                min={1}
                max={form.type === "percent" ? 90 : undefined}
                step="0.01"
                value={form.value}
                onChange={(e) => set("value", e.target.value)}
                placeholder={form.type === "percent" ? "10" : "200"}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cp-min">Minimum order (₹)</Label>
              <Input
                id="cp-min"
                type="number"
                min={0}
                value={form.minOrderValue}
                onChange={(e) => set("minOrderValue", e.target.value)}
                placeholder="No minimum"
              />
            </div>
            {form.type === "percent" && (
              <div className="space-y-1.5">
                <Label htmlFor="cp-max">Maximum discount (₹)</Label>
                <Input
                  id="cp-max"
                  type="number"
                  min={1}
                  value={form.maxDiscount}
                  onChange={(e) => set("maxDiscount", e.target.value)}
                  placeholder="No cap"
                />
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cp-start">Starts</Label>
              <Input id="cp-start" type="date" value={form.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-end">Ends (end of day)</Label>
              <Input id="cp-end" type="date" value={form.endsOn} onChange={(e) => set("endsOn", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-limit">Total uses</Label>
              <Input
                id="cp-limit"
                type="number"
                min={1}
                value={form.usageLimit}
                onChange={(e) => set("usageLimit", e.target.value)}
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => set("firstOrderOnly", e.target.checked)} />
              First order only — no earlier order from this email or mobile number
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.onePerCustomer} onChange={(e) => set("onePerCustomer", e.target.checked)} />
              Once per customer
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.showToShoppers}
                onChange={(e) => set("showToShoppers", e.target.checked)}
              />
              <span>
                Show to shoppers
                <span className="block text-xs text-muted-foreground">
                  Listed under “Available offers” in the cart and checkout, with an Apply button.
                  Untick for a private code that only works when typed.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
              Switched on
            </label>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save coupon"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CouponManager({ coupons }: { coupons: CouponRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<CouponRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function toggle(c: CouponRow) {
    startTransition(async () => {
      const r = await setCouponActiveAction(c.id, !c.active);
      if (r.ok) toast.success(c.active ? `${c.code} switched off.` : `${c.code} switched on.`);
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CouponFormDialog coupon={null} trigger={<Button size="sm">New coupon</Button>} />
      </div>

      <div className="space-y-3">
        {coupons.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-sm font-semibold tracking-wide">{c.code}</p>
                <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                <Badge variant="outline">{c.showToShoppers ? "shown to shoppers" : "private"}</Badge>
              </div>
              <p className="mt-1 text-sm">{describeCoupon(c)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Used {c.used}
                {c.usageLimit ? ` of ${c.usageLimit}` : ""} times · {inr(c.given)} given
                {c.endsOn ? ` · ends ${c.endsOn}` : ""}
                {c.description ? ` · ${c.description}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <CouponFormDialog coupon={c} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
              <Button variant="outline" size="sm" disabled={isPending} onClick={() => toggle(c)}>
                {c.active ? "Switch off" : "Switch on"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={isPending}
                onClick={() => {
                  setDeleting(c);
                  setDeleteOpen(true);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
        {coupons.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No coupons yet. Create one, then mention the code in an announcement.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${deleting?.code}?`}
        description={
          <>
            Orders that used it keep showing the code and discount. To stop new use
            but keep the record, use <strong>Switch off</strong> instead.
          </>
        }
        confirmLabel="Delete coupon"
        disabled={isPending}
        onConfirm={() =>
          deleting &&
          startTransition(async () => {
            const r = await deleteCouponAction(deleting.id);
            if (r.ok) toast.success(`${deleting.code} deleted.`);
            else toast.error(r.error);
          })
        }
      />
    </div>
  );
}
