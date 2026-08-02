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

export function ShipOrderButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function ship() {
    startTransition(async () => {
      const result = await createShipmentAction(orderId);
      if (result.ok) {
        toast.success(
          "trackingNumber" in result
            ? `Shipment created — AWB ${result.trackingNumber}`
            : "Shipment created."
        );
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
          Ship
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Shiprocket shipment?</DialogTitle>
          <DialogDescription>
            This books the shipment and assigns a tracking number (AWB). The
            order will be marked as shipped.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={ship} disabled={isPending}>
            {isPending ? "Creating…" : "Create shipment"}
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
