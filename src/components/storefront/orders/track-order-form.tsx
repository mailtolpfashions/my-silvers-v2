"use client";

import { useActionState } from "react";
import Link from "next/link";
import { trackOrderAction } from "@/actions/track-order-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Order number + email-or-mobile. A match navigates to the order's own page
 * (the action redirects); anything else comes back as a message here.
 *
 * `whatsappNumber` / `supportEmail` are the last resort for a shopper who has
 * lost both the confirmation email and the order number — the shop can find
 * the order in admin by their phone number.
 */
export function TrackOrderForm({
  whatsappNumber,
  supportEmail,
}: {
  whatsappNumber: string;
  supportEmail: string;
}) {
  const [state, formAction, isPending] = useActionState(trackOrderAction, undefined);

  const helpHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        "Hi, I can't find my MY Silvers order. My mobile number is: ",
      )}`
    : `mailto:${supportEmail}?subject=${encodeURIComponent("Help finding my order")}`;

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <div
          role="alert"
          className="border-l-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <p>{state.error}</p>
          {state.notFound && (
            <p className="mt-2 text-foreground">
              Still can&apos;t find it?{" "}
              <a
                href={helpHref}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {whatsappNumber ? "Message us on WhatsApp" : "Email us"}
              </a>{" "}
              with the mobile number you ordered with and we&apos;ll find it for you.
            </p>
          )}
        </div>
      )}

      {state?.signInHref && (
        <div className="border-l-2 border-foreground bg-muted px-3 py-3 text-sm">
          <p>This order was placed from a MY Silvers account. Sign in to see it.</p>
          <Button asChild variant="cta" size="cta" className="mt-3 w-full">
            <Link href={state.signInHref}>Sign in</Link>
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="orderNumber" required>
          Order number
        </Label>
        <Input
          id="orderNumber"
          name="orderNumber"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. MYS-000123"
          // Kept across a failed submit, so a typo in the other field does not
          // mean typing this one again.
          defaultValue={state?.values.orderNumber}
        />
        <p className="text-xs text-muted-foreground">
          On your order confirmation page and in our email.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact" required>
          Email or mobile number
        </Label>
        <Input
          id="contact"
          name="contact"
          required
          autoComplete="email"
          spellCheck={false}
          placeholder="The one you used at checkout"
          defaultValue={state?.values.contact}
        />
      </div>

      <Button type="submit" variant="cta" size="cta" className="w-full" disabled={isPending}>
        {isPending ? "Finding your order…" : "Track order"}
      </Button>
    </form>
  );
}
