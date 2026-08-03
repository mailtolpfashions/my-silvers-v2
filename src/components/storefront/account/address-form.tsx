"use client";

import { useActionState, useEffect } from "react";
import { addAddressAction, updateAddressAction } from "@/actions/account-actions";
import { INDIAN_STATES } from "@/lib/validation/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AddressValues = {
  id?: string;
  label: string | null;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

export function AddressForm({
  initial,
  onDone,
}: {
  initial?: AddressValues;
  onDone?: () => void;
}) {
  const isEdit = Boolean(initial?.id);
  const [state, formAction, isPending] = useActionState(
    isEdit ? updateAddressAction : addAddressAction,
    undefined
  );

  // Close the editor once the server confirms the write. In an effect, not
  // during render — calling the parent's setState mid-render is invalid.
  useEffect(() => {
    if (state?.success) onDone?.();
  }, [state?.success, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {initial?.id && <input type="hidden" name="addressId" value={initial.id} />}

      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="label">Label (optional)</Label>
          <Input id="label" name="label" placeholder="Home, Office…" defaultValue={initial?.label ?? ""} maxLength={30} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Recipient name</Label>
          <Input id="fullName" name="fullName" required defaultValue={initial?.fullName ?? ""} maxLength={80} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="addressPhone">Mobile number</Label>
        <Input
          id="addressPhone"
          name="phone"
          type="tel"
          inputMode="numeric"
          required
          placeholder="9876543210"
          defaultValue={initial?.phone ?? ""}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="addressLine1">Flat / House no., Building, Street</Label>
        <Input id="addressLine1" name="addressLine1" required defaultValue={initial?.addressLine1 ?? ""} maxLength={120} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="addressLine2">Area, Landmark (optional)</Label>
        <Input id="addressLine2" name="addressLine2" defaultValue={initial?.addressLine2 ?? ""} maxLength={120} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" required defaultValue={initial?.city ?? ""} maxLength={60} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">State</Label>
          <select
            id="state"
            name="state"
            required
            defaultValue={initial?.state ?? ""}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="" disabled>
              Select…
            </option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pincode">PIN code</Label>
          <Input
            id="pincode"
            name="pincode"
            inputMode="numeric"
            required
            placeholder="600001"
            defaultValue={initial?.pincode ?? ""}
            maxLength={6}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={initial?.isDefault ?? false}
          className="size-4 rounded border-input"
        />
        Use as my default delivery address
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : isEdit ? "Update address" : "Save address"}
        </Button>
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
