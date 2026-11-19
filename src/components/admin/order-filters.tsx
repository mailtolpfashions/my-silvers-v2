"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMING_BACK_FILTER, UNPAID_ATTEMPTS_FILTER } from "@/lib/order-coming-back";
import { orderStatusLabel, TO_PACK_FILTER } from "@/lib/order-status-labels";

/** Radix Select has no empty-string value, so "any" stands in for "no filter". */
const ANY = "any";

const ORDER_STATUSES = [
  "placed",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "return_requested",
  "returned",
  "refunded",
] as const;

const PAYMENT_STATUSES = ["pending", "paying", "paid", "failed", "refunded"] as const;

/** Turns return_requested into "Return requested". */
const humanise = (value: string) => orderStatusLabel(value);

export function AdminOrderFilters({
  current,
}: {
  current: { status?: string; payment?: string; q?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(current.q ?? "");

  /**
   * Built from the live searchParams rather than from `current`, so a sort the
   * admin has applied survives changing a filter.
   */
  function update(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value && value !== ANY) next.set(key, value);
    else next.delete(key);
    // Any change to the result set invalidates the page number.
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const hasFilters = Boolean(current.status || current.payment || current.q);

  return (
    // Same shape as the Products list (product-table-controls.tsx): the search
    // takes the free width, the filters sit on the right; stacked on a phone.
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update("q", q.trim() || null);
        }}
        className="relative flex-1"
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search order number, name, email or phone…"
          aria-label="Search orders"
          className="w-full pl-8"
        />
      </form>

      <Select value={current.status ?? ANY} onValueChange={(v) => update("status", v)}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Any status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any status</SelectItem>
          {ORDER_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {humanise(s)}
            </SelectItem>
          ))}
          {/* Not a status: parcels the courier is bringing back that are still
              waiting for "Received back". */}
          <SelectItem value={TO_PACK_FILTER}>To pack</SelectItem>
          <SelectItem value={COMING_BACK_FILTER}>Coming back</SelectItem>
          {/* Online payments never completed — hidden from the plain list. */}
          <SelectItem value={UNPAID_ATTEMPTS_FILTER}>Unpaid attempts</SelectItem>
        </SelectContent>
      </Select>

      <Select value={current.payment ?? ANY} onValueChange={(v) => update("payment", v)}>
        <SelectTrigger className="w-full sm:w-[160px]">
          <SelectValue placeholder="Any payment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any payment</SelectItem>
          {PAYMENT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {humanise(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            // Sort is deliberately preserved — clearing filters is about which
            // orders are shown, not how they are ordered.
            const next = new URLSearchParams(searchParams.toString());
            for (const key of ["status", "payment", "q", "page"]) next.delete(key);
            router.push(`${pathname}?${next.toString()}`);
          }}
        >
          <X className="size-4" />
          Clear
        </Button>
      )}
    </div>
  );
}
