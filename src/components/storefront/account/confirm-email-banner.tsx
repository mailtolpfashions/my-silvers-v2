"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendEmailConfirmationAction } from "@/actions/account-actions";

/**
 * Shown in the account until the email is confirmed. Says what the shopper
 * gains — their guest orders — rather than "verify your account", which reads
 * as a chore with no reason. See server/auth/email-verification.ts.
 */
export function ConfirmEmailBanner({ email }: { email: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-6 border-l-2 border-foreground bg-muted px-4 py-3 text-sm">
      <p>
        Please confirm <span className="font-medium">{email}</span> — we&apos;ve sent you a
        link. Once confirmed, orders you placed as a guest with this email will show here too.
      </p>
      {message ? (
        <p className="mt-2 text-muted-foreground" aria-live="polite">
          {message}
        </p>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await resendEmailConfirmationAction();
              setMessage(res.message);
            })
          }
        >
          {isPending ? "Sending…" : "Resend link"}
        </Button>
      )}
    </div>
  );
}
