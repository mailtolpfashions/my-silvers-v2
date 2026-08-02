"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  archiveProductAction,
  restoreProductAction,
} from "@/actions/admin-product-actions";

const ANY = "__any__";

export function AdminProductFilters({
  categories,
  current,
}: {
  categories: Array<{ id: string; name: string }>;
  current: { q?: string; category?: string; active?: string; stock?: string; flag?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(current.q ?? "");

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value && value !== ANY) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const select = (
    key: "category" | "active" | "stock" | "flag",
    placeholder: string,
    options: Array<[string, string]>
  ) => (
    <Select value={current[key] ?? ANY} onValueChange={(v) => update(key, v)}>
      <SelectTrigger className="w-full sm:w-[160px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{placeholder}</SelectItem>
        {options.map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <form
        className="flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          update("q", q);
        }}
      >
        <Input
          placeholder="Search name / SKU / slug…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
      {select("category", "All categories", categories.map((c) => [c.id, c.name]))}
      {select("active", "Any status", [
        ["active", "Active"],
        ["inactive", "Archived"],
      ])}
      {select("stock", "Any stock", [
        ["in", "In stock"],
        ["out", "Out of stock"],
      ])}
      {select("flag", "Any flag", [
        ["featured", "Featured"],
        ["bestseller", "Bestseller"],
      ])}
    </div>
  );
}

export function ProductRowActions({
  productId,
  isActive,
}: {
  productId: string;
  isActive: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = isActive
        ? await archiveProductAction(productId)
        : await restoreProductAction(productId);
      if (result.ok) {
        toast.success(isActive ? "Product archived." : "Product restored.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={isPending} onClick={toggle}>
      {isActive ? "Archive" : "Restore"}
    </Button>
  );
}
