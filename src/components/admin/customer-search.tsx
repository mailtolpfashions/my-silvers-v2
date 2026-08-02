"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";

export function CustomerSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initialQuery);

  return (
    <form
      className="max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q ? `${pathname}?q=${encodeURIComponent(q)}` : pathname);
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
