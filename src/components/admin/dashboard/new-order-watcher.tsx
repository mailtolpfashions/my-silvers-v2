"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

const POLL_MS = 30_000;
const PREFIX = /^\(\d+\)\s/;

type Live = {
  toShip: number;
  newest: { id: string; orderNumber: string; total: number } | null;
};

/**
 * Announces a new order anywhere in the admin, within one poll.
 *
 * A paid order once sat unnoticed. Now, while any admin page is open:
 *   - the browser tab reads "(3) Admin" — visible from another tab;
 *   - a toast says "New order MYS-000123 — ₹1,499" with a link to it;
 *   - the dashboard refreshes itself so the To ship card shows it.
 *
 * Polls /api/admin/live every 30 s, and not at all while the tab is hidden —
 * it checks again the moment the tab comes back, so nothing is missed, just
 * reported on return. The first reading only sets the baseline: opening the
 * admin must not toast about orders that were already there.
 */
export function NewOrderWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const last = useRef<number | null>(null);
  const pathRef = useRef(pathname);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const setTitle = (n: number) => {
      const base = document.title.replace(PREFIX, "");
      document.title = n > 0 ? `(${n}) ${base}` : base;
    };

    async function check() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/admin/live", { cache: "no-store" });
        if (!res.ok) return;
        const live = (await res.json()) as Live;
        setTitle(live.toShip);

        if (last.current !== null && live.toShip > last.current && live.newest) {
          const amount = `₹${live.newest.total.toLocaleString("en-IN")}`;
          const id = live.newest.id;
          toast.success(`New order ${live.newest.orderNumber} — ${amount}`, {
            description: "Paid and waiting to be shipped.",
            duration: 15_000,
            action: { label: "View", onClick: () => router.push(`/admin/orders/${id}`) },
          });
          if (pathRef.current === "/admin") router.refresh();
        }
        last.current = live.toShip;
      } catch {
        // Offline or a deploy in progress — the next poll will catch up.
      }
    }

    function loop() {
      if (stopped) return;
      timer = setTimeout(async () => {
        await check();
        loop();
      }, POLL_MS);
    }

    const onVisible = () => {
      if (!document.hidden) void check();
    };

    void check();
    loop();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  // Next rewrites document.title on every navigation AND on router.refresh(),
  // which drops the "(3)". Watch the <title> and put the count back whenever
  // it goes missing — only when missing, so this never loops on itself.
  useEffect(() => {
    const reapply = () => {
      const n = last.current;
      if (n && n > 0 && !PREFIX.test(document.title)) {
        document.title = `(${n}) ${document.title}`;
      }
    };
    const observer = new MutationObserver(reapply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
