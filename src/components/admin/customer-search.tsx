"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

export function CustomerSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQuery);

  return (
    <form
      className="max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        // Built from the live params rather than from scratch. Rebuilding the
        // URL as `?q=…` silently discarded any column sort the admin had
        // applied, so searching quietly reset the table's order.
        const next = new URLSearchParams(searchParams.toString());
        if (q.trim()) next.set("q", q.trim());
        else next.delete("q");
        const query = next.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
    >
      <Input
        placeholder="Search name / email / phone…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}
