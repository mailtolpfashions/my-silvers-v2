"use client";

import { useIsOwner } from "@/components/admin/owner-context";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  updateOrderStatusAction,
  getShippingQuotesAction,
  bookShipmentAction,
  schedulePickupAction,
  processReturnAction,
  cancelOrderAsStaffAction,
  receiveBackAction,
} from "@/actions/admin-order-actions";
import { CANCEL_REASONS, type CancelReason } from "@/lib/order-cancel-reasons";
import { allowedStatusMoves } from "@/lib/order-status-moves";
import { PROVIDER_LABEL, quoteKey, type CourierProviderId, type CourierQuote } from "@/lib/courier-quotes";


/**
 * The order's status — a dropdown for the owner, a plain label for an admin.
 *
 * An admin moves an order on through the Actions column (Ship order, Review
 * return) and the automatic updates (payment confirms
 * it, Shiprocket's tracking marks it delivered). Each of those checks the
 * order is in a state where the step makes sense. The dropdown checks
 * nothing — it can jump any order to any status, "shipped" with no waybill or
 * "refunded" with no refund — so it is the owner's override for fixing a
 * stuck order, not a way of working. updateOrderStatusAction enforces the
 * same rule on the server.
 *
 * It offers only the moves lib/order-status-moves.ts allows — never
 * "cancelled" (that is the Cancel order button), and nothing backwards once
 * the parcel has shipped.
 */
export function OrderStatusSelect({
  orderId,
  status,
  paymentStatus,
}: {
  orderId: string;
  status: string;
  paymentStatus: string;
}) {
  const isOwner = useIsOwner();
  const [isPending, startTransition] = useTransition();

  if (!isOwner) {
    return (
      <Badge variant="outline" className="capitalize">
        {status.replaceAll("_", " ")}
      </Badge>
    );
  }

  return (
    <Select
      value={status}
      disabled={isPending}
      onValueChange={(value) => {
        // Un-cancelling only relabels: stock a real cancellation put back stays
        // back. It exists to undo a wrong "cancelled" label, so say so first.
        if (
          status === "cancelled" &&
          !window.confirm(
            'This only changes the label: stock is NOT taken out again and nothing is charged. Use it to undo a wrong "cancelled" label.\n\nChange the label anyway?'
          )
        ) {
          return;
        }
        startTransition(async () => {
          const result = await updateOrderStatusAction(orderId, value);
          if (result.ok) toast.success("Status updated.");
          else toast.error(result.error);
        });
      }}
    >
      <SelectTrigger className="w-[160px]" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowedStatusMoves(status, paymentStatus).map((s) => (
          <SelectItem key={s} value={s}>
            {s.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Ship order: compare every courier from every partner switched on in
 * Settings (Shiprocket, NimbusPost), cheapest preselected, then book one.
 *
 * Opening the dialog only fetches prices — free, nothing booked. Booking is
 * the second, explicit click, labelled with the courier and the price, because
 * that is the one that spends money and puts the parcel in a courier's queue.
 * Prices are all-in (GST included — see lib/courier-quotes.ts), so "cheapest"
 * compares like with like across partners.
 */
export function ShipOrderButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState<CourierQuote[] | null>(null);
  const [errors, setErrors] = useState<Array<{ provider: CourierProviderId; message: string }>>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function load() {
    setLoading(true);
    setFailure(null);
    setErrors([]);
    const result = await getShippingQuotesAction(orderId);
    setLoading(false);
    if (!result.ok) {
      setFailure(result.error);
      setQuotes([]);
      return;
    }
    setQuotes(result.quotes);
    setErrors(result.errors);
    // Cheapest first, so the first is the preselected choice.
    setSelected(result.quotes[0] ? quoteKey(result.quotes[0]) : null);
  }

  const chosen = quotes?.find((q) => quoteKey(q) === selected) ?? null;

  function book() {
    if (!chosen) return;
    startTransition(async () => {
      const result = await bookShipmentAction(orderId, chosen.provider, chosen.courierId, chosen.total);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        "trackingNumber" in result
          ? `Booked ${result.courierName} — AWB ${result.trackingNumber}`
          : "Courier booked."
      );
      setOpen(false);
    });
  }

  const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Ship order</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a courier</DialogTitle>
          <DialogDescription>
            Prices from your courier partners, all-in with 18% GST. The cheapest is selected — pick
            another if you want a faster one. Nothing is booked until you press Book.
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="py-6 text-center text-sm text-muted-foreground">Getting prices…</p>}
        {failure && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{failure}</p>
        )}
        {errors.map((e) => (
          <p key={e.provider} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {PROVIDER_LABEL[e.provider]} couldn&apos;t give prices: {e.message}
          </p>
        ))}
        {!loading && quotes && quotes.length === 0 && !failure && (
          <p className="py-4 text-sm text-muted-foreground">
            No courier delivers to this pincode for this parcel. Check the address, or try again later.
          </p>
        )}

        {!loading && quotes && quotes.length > 0 && (
          <div className="max-h-[50dvh] overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Courier</th>
                  <th className="px-3 py-2 font-medium">Days</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Freight</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">COD</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q, i) => {
                  const key = quoteKey(q);
                  return (
                    <tr
                      key={key}
                      onClick={() => setSelected(key)}
                      className={`cursor-pointer border-t ${selected === key ? "bg-primary/5" : "hover:bg-muted/50"}`}
                    >
                      <td className="px-3 py-2">
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="radio"
                            name={`courier-${orderId}`}
                            checked={selected === key}
                            onChange={() => setSelected(key)}
                            className="mt-1"
                          />
                          <span>
                            <span className="font-medium">{q.courierName}</span>
                            <span className="block text-xs text-muted-foreground">
                              via {PROVIDER_LABEL[q.provider]}
                              {i === 0 && <span className="ml-1.5 font-semibold text-green-700">· Cheapest</span>}
                            </span>
                          </span>
                        </label>
                      </td>
                      <td className="px-3 py-2">{q.estimatedDays ?? "—"}</td>
                      <td className="hidden px-3 py-2 text-right sm:table-cell">{money(q.freight)}</td>
                      <td className="hidden px-3 py-2 text-right sm:table-cell">
                        {q.codCharges ? money(q.codCharges) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{money(q.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={book} disabled={isPending || !chosen}>
            {isPending ? "Booking…" : chosen ? `Book ${chosen.courierName} — ${money(chosen.total)}` : "Book"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Once a waybill exists: book the collection and get the label.
 *
 * Free and repeatable, so unlike Ship order this one goes straight
 * through without a confirmation dialogue — asking "are you sure?" about an
 * action that costs nothing and can be repeated just trains people to click
 * past dialogues that do matter.
 *
 * The label opens in a new tab rather than downloading: it is a PDF the admin
 * wants to look at and print, and a silent download into a folder is a worse
 * default for something you need in your hand in the next ten seconds.
 */
export function SchedulePickupButton({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await schedulePickupAction(orderId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          // `ok: true` alone does not narrow the union — the plain success
          // shape carries neither field. Probe for the label instead.
          if (!("labelUrl" in result)) {
            toast.success("Pickup requested.");
            return;
          }
          toast.success(
            result.scheduledFor
              ? `Pickup scheduled for ${result.scheduledFor}. Opening the label…`
              : "Pickup requested. Opening the label…"
          );
          window.open(result.labelUrl, "_blank", "noopener,noreferrer");
        })
      }
    >
      {isPending ? "Scheduling…" : "Pickup & label"}
    </Button>
  );
}

export function ReturnReviewButtons({
  orderId,
  reason,
  canRefund,
}: {
  orderId: string;
  reason: string | null;
  canRefund: boolean;
}) {
  // Refunds are the owner's — an admin approves or rejects only, and the
  // owner refunds afterwards. The action refuses an admin's refund anyway.
  const isOwner = useIsOwner();
  const mayRefund = canRefund && isOwner;
  const [open, setOpen] = useState(false);
  const [refund, setRefund] = useState(mayRefund);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function decide(action: "approve" | "reject") {
    startTransition(async () => {
      const result = await processReturnAction(
        orderId,
        action,
        action === "approve" && mayRefund && refund,
        note
      );
      if (result.ok) {
        toast.success(action === "approve" ? "Return approved." : "Return rejected.");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Review return
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return request</DialogTitle>
          <DialogDescription>{reason || "No reason given."}</DialogDescription>
        </DialogHeader>
        {mayRefund && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
            Refund the payment via Razorpay on approval
          </label>
        )}
        {/* Goes into the email the customer gets either way. On a decline it is
            the reason; left empty, the email just invites them to reply. */}
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Message to the customer (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="e.g. The video shows the piece was worn, so we can't accept it back."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
          />
          <span className="block text-xs text-muted-foreground">
            Included in the approval or decline email we send them.
          </span>
        </label>
        {canRefund && !isOwner && (
          <p className="text-sm text-muted-foreground">
            This order was paid online, so approving it — and deciding on the refund — is
            the owner&apos;s call. You can still reject it.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => decide("reject")} disabled={isPending}>
            Reject
          </Button>
          {(!canRefund || isOwner) && (
            <Button onClick={() => decide("approve")} disabled={isPending}>
              {isPending ? "Processing…" : "Approve return"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Received back" — for a parcel the courier brought back (RTO) or that was
 * cancelled after booking. Pressed with the piece in hand: stock goes up only
 * then, never on the courier's say-so. A damaged piece can be marked received
 * without being counted as sellable again.
 */
export function ReceivedBackButton({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(restock: boolean) {
    startTransition(async () => {
      const result = await receiveBackAction(orderId, restock);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        restock ? `${orderNumber} received — items added back to stock.` : `${orderNumber} marked as received.`
      );
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Received back
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Has {orderNumber} come back to you?</DialogTitle>
          <DialogDescription>
            Press this once the parcel is in your hands and you&apos;ve checked the piece. Its items
            go back into stock and can be sold again.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Came back damaged? Mark it received without adding it to stock.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => run(false)} disabled={isPending}>
            Damaged — don&apos;t add to stock
          </Button>
          <Button onClick={() => run(true)} disabled={isPending}>
            {isPending ? "Saving…" : "Received — add to stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cancel order — the proper way to cancel, for admin and owner alike.
 *
 * Runs the same steps as a customer cancelling: stock back, Shiprocket booking
 * released, a paid order refunded. Shown only before a courier is booked
 * (isCancellable); after that it is a return, not a cancellation.
 *
 * A paid online order refunds the customer, so for an admin this renders
 * nothing in a table row and a one-line explanation on the order page — the
 * owner's call, like approving a refund on a return. The action refuses it
 * either way.
 */
export function CancelOrderButton({
  orderId,
  orderNumber,
  paid,
  total,
  explainWhenHidden = false,
}: {
  orderId: string;
  orderNumber: string;
  /** Paid online — cancelling sends a Razorpay refund. */
  paid: boolean;
  /** Formatted, e.g. "₹1,499". Shown in the refund line. */
  total: string;
  /** On the order page, say why the button is missing instead of hiding silently. */
  explainWhenHidden?: boolean;
}) {
  const isOwner = useIsOwner();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancelReason | "">("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  if (paid && !isOwner) {
    return explainWhenHidden ? (
      <p className="text-xs text-muted-foreground">
        Paid online — cancelling refunds the customer, so only the owner can cancel this order.
      </p>
    ) : null;
  }

  function run() {
    startTransition(async () => {
      const result = await cancelOrderAsStaffAction(orderId, reason, note);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.refunded ? `${orderNumber} cancelled — refund started.` : `${orderNumber} cancelled.`);
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setReason("");
          setNote("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          Cancel order
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel order {orderNumber}?</DialogTitle>
          <DialogDescription>
            The items go back into stock and any Shiprocket booking is released.
            {paid && ` The customer is refunded ${total} through Razorpay.`} The customer is emailed to let them know. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Why?</legend>
          {(Object.entries(CANCEL_REASONS) as [CancelReason, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`cancel-reason-${orderId}`}
                value={key}
                checked={reason === key}
                onChange={() => setReason(key)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder={reason === "other" ? "Say briefly why (required)" : "Note (optional)"}
          aria-label="Note"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Keep order
          </Button>
          <Button
            variant="destructive"
            onClick={run}
            disabled={isPending || !reason || (reason === "other" && !note.trim())}
          >
            {isPending ? "Cancelling…" : "Cancel order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
