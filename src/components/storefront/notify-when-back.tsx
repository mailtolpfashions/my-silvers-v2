"use client";

import { useState, useSyncExternalStore } from "react";
import { Bell, Check } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSize } from "@/components/storefront/size-selector";
import { notifyWhenBackAction } from "@/actions/stock-notification-actions";
import {
  subscribeUserState,
  getUserStateSnapshot,
  getUserStateServerSnapshot,
} from "@/lib/user-state-store";

/**
 * "Notify me" — the second button on a sold-out piece.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * A sold-out product page used to show two identical greyed "Out of stock"
 * buttons and an email box further down: the shopper who wanted this exact
 * piece was shown a dead end twice. Now the second button is the way forward,
 * and the waiting list it fills is the best demand signal the shop has — per
 * size, people who had already decided.
 *
 *   signed in  one tap; the alert goes to the account's email (the server
 *              reads it from the session — nothing typed, nothing trusted)
 *   guest      a small dialog asks for an email — one field, never a name or
 *              an account, which would be asking more than the favour is worth
 *
 * For a sized piece it asks for the size first, through the same selector
 * check as Add to cart, because a restock is per size.
 */
export function NotifyMeButton({
  productId,
  isAuthed,
  compact = false,
}: {
  productId: string;
  /** Server-known, used until the client store is ready — as Add to cart does. */
  isAuthed?: boolean;
  /** The pinned mobile bar: one step shorter. */
  compact?: boolean;
}) {
  const { requireSize } = useSize();
  const store = useSyncExternalStore(subscribeUserState, getUserStateSnapshot, getUserStateServerSnapshot);
  const authed = store.status === "ready" ? store.isAuthed : (isAuthed ?? false);

  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [size, setSize] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function subscribe(chosenSize: string, typedEmail?: string) {
    setError(null);
    setState("sending");
    const result = await notifyWhenBackAction({ productId, size: chosenSize, email: typedEmail });
    if (!result.ok) {
      setState("idle");
      if (typedEmail !== undefined) setError(result.error);
      else toast.error(result.error);
      return;
    }
    setState("done");
    setDialogOpen(false);
    toast.success(
      `We'll email ${result.email} the moment it's back${chosenSize ? ` in size ${chosenSize}` : ""}.`
    );
  }

  function handleClick() {
    const chosen = requireSize();
    if (chosen === null) return; // the size selector shows its own prompt
    setSize(chosen);
    if (authed) void subscribe(chosen);
    else setDialogOpen(true);
  }

  const className = compact
    ? "h-12 w-full min-w-0 shrink px-4 text-xs tracking-[0.06em] sm:h-12 sm:px-4"
    : "w-full min-w-0 shrink px-4 text-xs tracking-[0.06em] sm:px-4 md:tracking-[0.08em]";

  return (
    <>
      <Button
        variant="cta"
        size="cta"
        className={className}
        disabled={state !== "idle"}
        onClick={handleClick}
      >
        {state === "done" ? (
          <>
            <Check className="size-4" />
            We&apos;ll notify you
          </>
        ) : state === "sending" && !dialogOpen ? (
          "Just a moment…"
        ) : (
          <>
            <Bell className="size-4" />
            Notify me
          </>
        )}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>We&apos;ll tell you when it&apos;s back</DialogTitle>
            <DialogDescription>
              {size ? `Size ${size} is` : "This piece is"} sold out right now. Leave your email and
              we&apos;ll write the moment it returns — just that one email.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void subscribe(size, email);
            }}
            className="space-y-2"
          >
            <Input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              aria-label="Email address for a back-in-stock alert"
              aria-invalid={Boolean(error)}
              disabled={state === "sending"}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={state === "sending"}>
                {state === "sending" ? "Saving…" : "Notify me"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The in-stock piece whose CHOSEN size is sold out.
 *
 * The buttons above stay "Buy now / Add to cart" in this case — the product as
 * a whole has stock — so the way to be told about this size sits under them.
 * When the whole piece is sold out the buttons themselves become
 * "Out of stock / Notify me" and this renders nothing.
 *
 * ⚠️  Gating on the product total alone would be wrong: a ring with four in
 * size 8 and none in size 6 is "in stock", and the shopper who wants a 6 would
 * get no way to be told — the case where the demand signal is worth most.
 */
export function NotifyWhenBackForSelection({
  productId,
  stock,
}: {
  productId: string;
  /** Product-level stock. */
  stock: number;
}) {
  const { sizes, stockBySize, selected } = useSize();
  if (stock <= 0 || sizes.length === 0 || !selected) return null;
  if ((stockBySize[selected] ?? 0) > 0) return null;

  return (
    <div className="mt-5 space-y-2 lg:max-w-xl">
      <p className="text-sm text-muted-foreground">
        Size {selected} is sold out — we&apos;ll tell you when it&apos;s back.
      </p>
      <div className="md:max-w-[calc(50%-0.375rem)]">
        <NotifyMeButton productId={productId} />
      </div>
    </div>
  );
}
