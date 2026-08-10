"use client";

import { useCallback, useState } from "react";
import { useActionState } from "react";
import { AddressForm, type AddressValues } from "@/components/storefront/account/address-form";
import { deleteAddressAction, setDefaultAddressAction } from "@/actions/account-actions";
import { MAX_ADDRESSES } from "@/lib/validation/account";
import { Button } from "@/components/ui/button";

export function AddressBook({ addresses }: { addresses: AddressValues[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const atLimit = addresses.length >= MAX_ADDRESSES;

  const closeAll = useCallback(() => {
    setEditingId(null);
    setIsAdding(false);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {addresses.length} of {MAX_ADDRESSES} saved
        </p>
        {!isAdding && (
          <Button
            size="sm"
            onClick={() => {
              setEditingId(null);
              setIsAdding(true);
            }}
            disabled={atLimit}
          >
            Add address
          </Button>
        )}
      </div>

      {atLimit && !isAdding && (
        <p className="bg-muted px-3 py-2 text-sm text-muted-foreground">
          You&apos;ve saved the maximum of {MAX_ADDRESSES} addresses. Delete one to add another.
        </p>
      )}

      {isAdding && (
        <div className="border-b py-5">
          <h3 className="mb-4 text-sm font-medium">New address</h3>
          <AddressForm onDone={closeAll} />
        </div>
      )}

      {addresses.length === 0 && !isAdding ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No saved addresses yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {addresses.map((address) => (
            <li key={address.id} className="border-b py-5">
              {editingId === address.id ? (
                <>
                  <h3 className="mb-4 text-sm font-medium">Edit address</h3>
                  <AddressForm initial={address} onDone={closeAll} />
                </>
              ) : (
                <AddressCard
                  address={address}
                  onEdit={() => {
                    setIsAdding(false);
                    setEditingId(address.id ?? null);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddressCard({
  address,
  onEdit,
}: {
  address: AddressValues;
  onEdit: () => void;
}) {
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteAddressAction, undefined);
  const [defaultState, defaultAction, isSettingDefault] = useActionState(
    setDefaultAddressAction,
    undefined
  );

  const error = deleteState?.error ?? defaultState?.error;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 text-sm">
          <p className="flex items-center gap-2 font-medium">
            {address.fullName}
            {address.label && (
              <span className="text-xs text-muted-foreground">({address.label})</span>
            )}
            {address.isDefault && (
              <span className="text-xs uppercase tracking-[0.1em] text-brass-text">Default</span>
            )}
          </p>
          <p className="text-muted-foreground">
            {address.addressLine1}
            {address.addressLine2 ? `, ${address.addressLine2}` : ""}
          </p>
          <p className="text-muted-foreground">
            {address.city}, {address.state} — {address.pincode}
          </p>
          <p className="text-muted-foreground">{address.phone}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edit
          </Button>

          {!address.isDefault && (
            <form action={defaultAction}>
              <input type="hidden" name="addressId" value={address.id} />
              <Button size="sm" variant="ghost" type="submit" disabled={isSettingDefault}>
                {isSettingDefault ? "Setting…" : "Make default"}
              </Button>
            </form>
          )}

          <form action={deleteAction}>
            <input type="hidden" name="addressId" value={address.id} />
            <Button size="sm" variant="ghost" type="submit" disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </form>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
