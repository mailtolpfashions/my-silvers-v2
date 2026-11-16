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
  createShipmentAction,
  assignAwbAction,
  schedulePickupAction,
  processReturnAction,
  cancelOrderAsStaffAction,
} from "@/actions/admin-order-actions";
import { CANCEL_REASONS, type CancelReason } from "@/lib/order-cancel-reasons";

const STATUSES = [
  "placed",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "return_requested",
  "returned",
  "refunded",
] as const;

/**
 * The order's status — a dropdown for the owner, a plain label for an admin.
 *
 * An admin moves an order on through the Actions column (Send to Shiprocket,
 * Assign courier, Review return) and the automatic updates (payment confirms
 * it, Shiprocket's tracking marks it delivered). Each of those checks the
 * order is in a state where the step makes sense. The dropdown checks
 * nothing — it can jump any order to any status, "shipped" with no waybill or
 * "refunded" with no refund — so it is the owner's override for fixing a
 * stuck order, not a way of working. updateOrderStatusAction enforces the
 * same rule on the server.
 */
export function OrderStatusSelect({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
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
        // The dropdown only relabels. Cancelling for real — stock back, refund —
        // is the Cancel order button; say so before the label goes on.
        if (
          value === "cancelled" &&
          !window.confirm(
            "This only changes the label: items are NOT put back into stock and the customer is NOT refunded. To cancel properly, use Cancel order in Actions.\n\nChange the label anyway?"
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
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The two halves of shipping, as two buttons.
 *
 * They are deliberately not merged back into one "Ship" control. Creating the
 * Shiprocket order is free and undoable; assigning the waybill spends money and
 * puts the parcel in a courier's queue. An admin should be able to do the first
 * without being committed to the second — see integrations/shiprocket.ts.
 *
 * Which one shows is driven by state the row already has: no shiprocketOrderId
 * means step one is outstanding, an id with no AWB means step two is.
 */
export function ShipOrderButton({
  orderId,
  hasShiprocketOrder,
}: {
  orderId: string;
  hasShiprocketOrder: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = hasShiprocketOrder
        ? await assignAwbAction(orderId)
        : await createShipmentAction(orderId);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        "trackingNumber" in result
          ? `Waybill assigned — AWB ${result.trackingNumber}`
          : "Sent to Shiprocket. Assign a courier when you are ready to dispatch."
      );
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={hasShiprocketOrder ? "default" : "outline"} size="sm">
          {hasShiprocketOrder ? "Assign courier" : "Send to Shiprocket"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {hasShiprocketOrder ? "Assign a courier and buy the waybill?" : "Send this order to Shiprocket?"}
          </DialogTitle>
          <DialogDescription>
            {hasShiprocketOrder
              ? "This books a courier, charges your Shiprocket wallet and marks the order shipped. It cannot be undone for free — cancelling afterwards cancels a live waybill."
              : "This registers the order in your Shiprocket account so you can see and check it there. Nothing is booked with a courier and nothing is charged; you can cancel it freely."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={run} disabled={isPending}>
            {isPending
              ? hasShiprocketOrder
                ? "Assigning…"
                : "Sending…"
              : hasShiprocketOrder
                ? "Assign courier"
                : "Send to Shiprocket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Step three, once a waybill exists: book the collection and get the label.
 *
 * Free and repeatable, so unlike the two before it this one goes straight
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
  const [isPending, startTransition] = useTransition();

  function decide(action: "approve" | "reject") {
    startTransition(async () => {
      const result = await processReturnAction(orderId, action, action === "approve" && mayRefund && refund);
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
      toast.success(result.refunded ? `${orderNumber} cancelled and refunded.` : `${orderNumber} cancelled.`);
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
            {paid && ` The customer is refunded ${total} through Razorpay.`} This can&apos;t be undone.
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
