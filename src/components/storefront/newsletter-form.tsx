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
      <p className="text-sm text-white/75">
        Thanks for subscribing — see you in your inbox.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex items-end gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          aria-label="Email address for newsletter"
          // border-white/40 is 3.82:1 against the footer. /25 looked right but
          // measured 2.24:1 — under the 3:1 a real control boundary needs.
          className="h-11 w-full min-w-0 flex-1 border-0 border-b border-white/40 bg-transparent px-0 text-sm text-white outline-none transition-colors placeholder:text-white/50 focus:border-white"
        />
        {/* A white block with a graphite label. It was a BRASS fill, which
            broke the palette rule that --black is decorative and never a fill
            behind text; white is the inverted commerce CTA used on the hero and
            the story block, so this matches the rest of the site. */}
        <Button
          type="submit"
          disabled={isPending}
          variant="cta"
          size="cta"
          className="h-11 shrink-0 bg-white px-6 text-black hover:bg-half-white sm:h-11 sm:px-6"
        >
          {isPending ? "Subscribing…" : "Subscribe"}
        </Button>
      </div>
      {result && <p className="text-sm text-red-300">{result}</p>}
    </form>
  );
}
