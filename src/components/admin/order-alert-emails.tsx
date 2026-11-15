"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { saveOrderAlertEmailsAction, sendTestOrderAlertAction } from "@/actions/admin-alert-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Settings → "New-order alerts": the addresses that get an email the moment
 * an order is paid (or a COD order is placed). Owner only — see
 * server/settings/order-alerts.ts.
 */
export function OrderAlertEmails({
  initial,
  ownerEmails,
  max,
}: {
  initial: string[];
  /** Who gets alerts while the list is empty. */
  ownerEmails: string[];
  max: number;
}) {
  const [emails, setEmails] = useState(initial);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const dirty = JSON.stringify(emails) !== JSON.stringify(initial);

  function add() {
    const e = draft.trim().toLowerCase();
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error("That doesn't look like an email address.");
      return;
    }
    if (emails.includes(e)) {
      setDraft("");
      return;
    }
    if (emails.length >= max) {
      toast.error(`Up to ${max} addresses.`);
      return;
    }
    setEmails([...emails, e]);
    setDraft("");
  }

  function save() {
    startTransition(async () => {
      const r = await saveOrderAlertEmailsAction(emails);
      if (r.ok) toast.success("Saved. New-order emails will go to this list.");
      else toast.error(r.error);
    });
  }

  function test() {
    startTransition(async () => {
      const r = await sendTestOrderAlertAction();
      if (r.ok) toast.success(r.message ?? "Test sent.");
      else toast.error(r.error);
    });
  }

  return (
    <section aria-labelledby="alerts-heading" className="space-y-4 rounded-lg border bg-card p-5">
      <div>
        <h2 id="alerts-heading" className="font-semibold">
          New-order alerts
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These addresses get an email the moment an order is paid, or a cash-on-delivery order is
          placed. {emails.length === 0 && (
            <>
              While the list is empty, alerts go to the owner:{" "}
              <strong className="text-foreground">{ownerEmails.join(", ") || "—"}</strong>.
            </>
          )}
        </p>
      </div>

      {emails.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Alert emails">
          {emails.map((e) => (
            <li key={e} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-sm">
              {e}
              <button
                type="button"
                aria-label={`Remove ${e}`}
                onClick={() => setEmails(emails.filter((x) => x !== e))}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="alert-email">Add an email</Label>
          <Input
            id="alert-email"
            type="email"
            value={draft}
            placeholder="name@example.com"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="button" onClick={save} disabled={isPending || !dirty}>
          {isPending ? "Saving…" : "Save alert list"}
        </Button>
        <Button type="button" variant="outline" onClick={test} disabled={isPending || dirty}>
          Send a test email
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Save first, then send a test.</span>}
      </div>
    </section>
  );
}
