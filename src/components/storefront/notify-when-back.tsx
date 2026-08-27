"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSize } from "@/components/storefront/size-selector";
import { notifyWhenBackAction } from "@/actions/stock-notification-actions";

/**
 * Shows the form only when the thing the shopper is actually looking at is
 * sold out — which for a sized piece is the SIZE, not the product.
 *
 * ⚠️  Gating on the product total would be wrong in the common case. A ring
 * with four in size 8 and none in size 6 is "in stock" by that measure, so the
 * shopper who wants a 6 gets a greyed-out button and no way to be told —
 * exactly the dead end this feature exists to remove. It is also the case where
 * the demand signal is worth most, because it says which size to reorder.
 *
 * Renders nothing while a sized product has no size chosen yet: there is no
 * question to answer until the shopper has pointed at one.
 */
export function NotifyWhenBackForSelection({ productId }: { productId: string }) {
  const { sizes, stockBySize, selected } = useSize();
  const requiresSize = sizes.length > 0;

  if (requiresSize && !selected) return null;

  const soldOut = requiresSize ? (stockBySize[selected] ?? 0) <= 0 : true;
  if (!soldOut) return null;

  return (
    <NotifyWhenBack
      productId={productId}
      size={requiresSize ? selected : ""}
      requiresSize={requiresSize}
    />
  );
}

/**
 * "Email me when this is back."
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * A sold-out product page is the one page on the shop with nothing to offer.
 * The visitor wanted this exact piece — they are further down the path than
 * anyone browsing a listing — and the page's only remaining suggestion is to
 * leave. This turns that into the best demand signal the shop has: a list, per
 * size, of people who had already decided.
 *
 * Deliberately one field. Asking a stranger for a name, or to make an account,
 * to be told a ring is back is asking for more than the favour is worth.
 */
export function NotifyWhenBack({
  productId,
  size,
  requiresSize,
}: {
  productId: string;
  /** The chosen size, or "" for an unsized piece. */
  size: string;
  /** Whether this product has sizes at all — decides what a blank `size` means. */
  requiresSize: boolean;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const needsSize = requiresSize && !size;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");

    const result = await notifyWhenBackAction({ productId, size, email });

    if (result.ok) {
      setState("done");
      return;
    }
    setState("idle");
    setError(result.error);
  }

  /**
   * Replaces the form outright rather than sitting above it.
   *
   * Leaving an empty box under a confirmation invites a second submission, and
   * the second one has nothing new to do — the row is already there. Saying it
   * once and closing the form is the honest shape.
   */
  if (state === "done") {
    return (
      <p className="mt-5 border-l-2 border-[var(--oxide)] bg-half-white px-3 py-2.5 text-sm">
        We&apos;ll email you the moment it&apos;s back
        {size ? ` in size ${size}` : ""}.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-2">
      <p className="text-sm text-muted-foreground">
        {needsSize
          ? "Choose a size and we'll tell you when it's back."
          : "Sold out — we'll tell you when it returns."}
      </p>

      <div className="flex gap-2">
        <Input
          type="email"
          required
          value={email}
          // Disabled rather than hidden while a size is outstanding: the field
          // is the explanation for the sentence above it, and removing it makes
          // the instruction read as an apology with nothing to act on.
          disabled={needsSize || state === "sending"}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          aria-label="Email address for a back-in-stock alert"
          aria-invalid={Boolean(error)}
        />
        <Button type="submit" variant="outline" disabled={needsSize || state === "sending"}>
          {state === "sending" ? "…" : "Notify me"}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
