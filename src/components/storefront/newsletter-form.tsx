"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { subscribeNewsletterAction } from "@/actions/newsletter-actions";

/**
 * Newsletter signup. Styled explicitly for the dark footer, which is its only
 * consumer — every colour here is stated rather than inherited from the shared
 * light-surface tokens.
 *
 * That is not fussiness. This used `<Button variant="outline">`, which sets
 * `bg-background` (ivory) but NO text colour, so the label fell back to the
 * footer's `text-white`: white on near-white, 1.02:1, invisible until hover
 * brought in `hover:text-foreground`. The status messages had the mirror
 * problem — `text-muted-foreground` and `text-destructive` are tuned for a pale
 * page and sat at 3.10:1 and 2.78:1 on the footer's graphite.
 *
 * The shared <Input> is deliberately not used for the same reason: its
 * `placeholder:text-muted-foreground` is unreadable here.
 */
export function NewsletterForm() {
  const [result, formAction, isPending] = useActionState(subscribeNewsletterAction, undefined);

  if (result === "subscribed") {
    return (
      <p className="text-base text-white/75">
        Thanks for subscribing — see you in your inbox. ✨
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          aria-label="Email address for newsletter"
          // border-white/40 is 3.82:1 against the footer. /25 looked right but
          // measured 2.24:1 — under the 3:1 a real control boundary needs.
          className="h-11 w-full max-w-60 rounded-full border border-white/40 bg-white/5 px-4 text-base text-white outline-none transition-colors placeholder:text-white/50 focus:border-brass"
        />
        {/* Brass fill with a graphite label — the same pairing as the hero CTA,
            and the one combination on this background that reads at rest. */}
        <Button
          type="submit"
          disabled={isPending}
          className="h-11 shrink-0 rounded-full bg-brass px-5 text-base text-graphite-950 hover:bg-brass-light"
        >
          {isPending ? "Subscribing…" : "Subscribe"}
        </Button>
      </div>
      {result && <p className="text-sm text-red-300">{result}</p>}
    </form>
  );
}
