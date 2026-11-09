"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { saveOrderToAccountAction } from "@/actions/guest-account-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The block above a guest's order, making sure they leave with a way back.
 *
 * Guest checkout does not verify the email. If it was mistyped, the
 * confirmation goes nowhere — so this page has to hand over the order number
 * itself (big, copyable), say which address the email went to while there is
 * still time to notice it is wrong, and point at /track-order, which works
 * with the mobile number too.
 */
export function GuestOrderHelp({
  orderNumber,
  email,
  placed,
  claim,
}: {
  orderNumber: string;
  email: string;
  /** Just placed — show the thank-you framing. */
  placed: boolean;
  /** Present only when this order can be saved to a new account. */
  claim: { orderId: string; token: string; email: string } | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(orderNumber);
      setCopied(true);
      toast.success("Order number copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — please note it down.");
    }
  }

  return (
    <div className="mb-8 space-y-4">
      <div className="border bg-muted/40 p-4 sm:p-5">
        {placed && (
          <p className="mb-3 text-sm font-medium text-green-800">
            Thank you! Your order has been placed.
          </p>
        )}
        <p className="label-eyebrow">Your order number</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="text-h3 tabular-nums tracking-wide">{orderNumber}</span>
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          We&apos;ve sent the details to{" "}
          <span className="font-medium text-foreground">{email}</span>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Email not right, or nothing arrived? No problem — save this order number. You can
          check your order any time on{" "}
          <Link href="/track-order" className="text-foreground underline underline-offset-4">
            Track order
          </Link>{" "}
          with this number and your mobile number.
        </p>
      </div>

      {claim && <SaveToAccount claim={claim} />}
    </div>
  );
}

function SaveToAccount({ claim }: { claim: { orderId: string; token: string; email: string } }) {
  const [open, setOpen] = useState(false);
  const [message, formAction, isPending] = useActionState(saveOrderToAccountAction, undefined);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border p-4 text-sm">
        <p>Save this order to an account — sign in next time, no order number needed.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Set a password
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 border p-4">
      <input type="hidden" name="orderId" value={claim.orderId} />
      <input type="hidden" name="token" value={claim.token} />
      <p className="text-sm">
        You&apos;ll sign in with <span className="font-medium">{claim.email}</span>.
      </p>
      {message && <p className="text-sm text-destructive">{message}</p>}
      <div className="space-y-1.5">
        <Label htmlFor="new-password" required>
          Choose a password
        </Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <Button type="submit" variant="cta" size="cta" className="w-full" disabled={isPending}>
        {isPending ? "Saving…" : "Save to my account"}
      </Button>
    </form>
  );
}
