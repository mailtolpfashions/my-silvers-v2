"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeNewsletterAction } from "@/actions/newsletter-actions";

export function NewsletterForm() {
  const [result, formAction, isPending] = useActionState(subscribeNewsletterAction, undefined);

  if (result === "subscribed") {
    return (
      <p className="text-sm text-muted-foreground">
        Thanks for subscribing — see you in your inbox. ✨
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <Input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="max-w-60"
          aria-label="Email address for newsletter"
        />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? "Subscribing…" : "Subscribe"}
        </Button>
      </div>
      {result && <p className="text-xs text-destructive">{result}</p>}
    </form>
  );
}
