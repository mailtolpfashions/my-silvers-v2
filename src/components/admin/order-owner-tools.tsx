"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StickyActions } from "@/components/layout/sticky-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INDIAN_STATES } from "@/lib/validation/account";
import {
  deleteOrderAction,
  saveOrderNoteAction,
  updateOrderAddressAction,
} from "@/actions/admin-order-actions";
import { ConfirmAction } from "@/components/admin/confirm-action";

export type OrderAddress = {
  fullName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

const FIELDS: Array<[keyof OrderAddress, string]> = [
  ["fullName", "Recipient name"],
  ["phone", "Phone"],
  ["addressLine1", "House / flat and street"],
  ["addressLine2", "Area / landmark (optional)"],
  ["city", "City"],
  ["pincode", "PIN code"],
];

/**
 * The owner's edit and delete controls on an order. Every action re-checks
 * with requireOwner() and is written to the activity log.
 */
export function OrderOwnerTools({
  orderId,
  orderNumber,
  address,
  note,
  canEditAddress,
  deletable,
}: {
  orderId: string;
  orderNumber: string;
  address: OrderAddress;
  note: string | null;
  canEditAddress: boolean;
  deletable: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OrderAddress>(address);
  const [text, setText] = useState(note ?? "");

  function saveAddress(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await updateOrderAddressAction(orderId, form);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Delivery address updated.");
      setEditing(false);
      router.refresh();
    });
  }

  function saveNote() {
    startTransition(async () => {
      const r = await saveOrderNoteAction(orderId, text);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Note saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-2">
        <Label htmlFor="order-note">Private note (only staff see this)</Label>
        <Textarea
          id="order-note"
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Customer called — deliver after 5 pm"
        />
        <Button type="button" size="sm" variant="outline" onClick={saveNote} disabled={isPending || text === (note ?? "")}>
          Save note
        </Button>
      </div>

      <div className="space-y-2 border-t pt-4">
        <p className="font-medium">Delivery address</p>
        {!canEditAddress ? (
          <p className="text-xs text-muted-foreground">
            The shipment is booked, so the address can only be changed with the courier.
          </p>
        ) : !editing ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit delivery address
          </Button>
        ) : (
          <form onSubmit={saveAddress} className="space-y-3">
            {FIELDS.map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`addr-${key}`}>{label}</Label>
                <Input
                  id={`addr-${key}`}
                  value={form[key] ?? ""}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  required={key !== "addressLine2"}
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="addr-state">State</Label>
              <select
                id="addr-state"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.state ?? ""}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                required
              >
                <option value="">Select a state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <StickyActions className="flex gap-2">
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "Saving…" : "Save address"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setForm(address);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </StickyActions>
          </form>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <p className="font-medium">Delete order</p>
        {deletable ? (
          <ConfirmAction
            action={deleteOrderAction.bind(null, orderId)}
            label="Delete this order"
            title={`Delete order ${orderNumber}?`}
            description="It was never paid, so no money or stock is involved. It disappears from every list and can't be brought back."
            confirmLabel="Delete order"
            typeToConfirm="delete"
            success={`Order ${orderNumber} deleted.`}
            redirectTo="/admin/orders"
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Paid, refunded and live COD orders are financial records and can&apos;t be deleted —
            cancel or refund instead.
          </p>
        )}
      </div>
    </div>
  );
}
