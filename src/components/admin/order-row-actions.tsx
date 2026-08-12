"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
  processReturnAction,
} from "@/actions/admin-order-actions";

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

export function OrderStatusSelect({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={isPending}
      onValueChange={(value) =>
        startTransition(async () => {
          const result = await updateOrderStatusAction(orderId, value);
          if (result.ok) toast.success("Status updated.");
          else toast.error(result.error);
        })
      }
    >
      <SelectTrigger className="w-[160px]" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {s.replace("_", " ")}
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

export function ReturnReviewButtons({
  orderId,
  reason,
  canRefund,
}: {
  orderId: string;
  reason: string | null;
  canRefund: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [refund, setRefund] = useState(canRefund);
  const [isPending, startTransition] = useTransition();

  function decide(action: "approve" | "reject") {
    startTransition(async () => {
      const result = await processReturnAction(orderId, action, action === "approve" && refund);
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
        {canRefund && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
            Refund the payment via Razorpay on approval
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => decide("reject")} disabled={isPending}>
            Reject
          </Button>
          <Button onClick={() => decide("approve")} disabled={isPending}>
            {isPending ? "Processing…" : "Approve return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
