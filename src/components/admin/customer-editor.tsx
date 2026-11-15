"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INDIAN_STATES } from "@/lib/validation/account";
import {
  deleteCustomerAddressAction,
  saveCustomerAddressAction,
  updateCustomerProfileAction,
} from "@/actions/admin-customer-actions";

export type CustomerAddress = {
  id: string;
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

type Draft = Omit<CustomerAddress, "id"> & { id: string | null };

const EMPTY: Draft = {
  id: null,
  label: "",
  fullName: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  pincode: "",
  isDefault: false,
};

/** Owner-only: edit a customer's name/phone and their saved addresses. */
export function CustomerEditor({
  userId,
  name,
  phone,
  addresses,
  maxAddresses,
}: {
  userId: string;
  name: string;
  phone: string;
  addresses: CustomerAddress[];
  maxAddresses: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [profile, setProfile] = useState({ name, phone });
  const [draft, setDraft] = useState<Draft | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? "Something went wrong.");
      toast.success(done);
      after?.();
      router.refresh();
    });

  const field = (key: keyof Draft, label: string, optional = false) => (
    <div className="space-y-1">
      <Label htmlFor={`ca-${key}`}>{label}</Label>
      <Input
        id={`ca-${key}`}
        value={String(draft?.[key] ?? "")}
        required={!optional}
        onChange={(e) => draft && setDraft({ ...draft, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="space-y-8">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateCustomerProfileAction(userId, profile), "Customer updated.");
        }}
      >
        <h2 className="font-semibold">Profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cust-name">Name</Label>
            <Input
              id="cust-name"
              value={profile.name}
              required
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cust-phone">Mobile</Label>
            <Input
              id="cust-phone"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
          </div>
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={isPending || (profile.name === name && profile.phone === phone)}
        >
          Save profile
        </Button>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Saved addresses</h2>
          {!draft && addresses.length < maxAddresses && (
            <Button type="button" size="sm" variant="outline" onClick={() => setDraft({ ...EMPTY })}>
              Add address
            </Button>
          )}
        </div>

        {addresses.length === 0 && !draft && (
          <p className="text-sm text-muted-foreground">No saved addresses.</p>
        )}

        <ul className="space-y-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">
                  {a.fullName}
                  {a.isDefault && <span className="ml-2 text-xs text-muted-foreground">Default</span>}
                </p>
                <p className="text-muted-foreground">
                  {[a.addressLine1, a.addressLine2, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(", ")}
                </p>
                <p className="text-muted-foreground">{a.phone}</p>
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...a })}>
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={isPending}
                  onClick={() => run(() => deleteCustomerAddressAction(userId, a.id), "Address deleted.")}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {draft && (
          <form
            className="space-y-3 rounded-md border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const { id, ...rest } = draft;
              run(
                () => saveCustomerAddressAction(userId, id, rest),
                id ? "Address updated." : "Address added.",
                () => setDraft(null)
              );
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {field("fullName", "Recipient name")}
              {field("phone", "Mobile")}
              {field("addressLine1", "House / flat and street")}
              {field("addressLine2", "Area / landmark (optional)", true)}
              {field("city", "City")}
              {field("pincode", "PIN code")}
              <div className="space-y-1">
                <Label htmlFor="ca-state">State</Label>
                <select
                  id="ca-state"
                  required
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={draft.state}
                  onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                >
                  <option value="">Select a state</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={draft.isDefault}
                  onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
                />
                Default address
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={isPending}>
                {draft.id ? "Save address" : "Add address"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
