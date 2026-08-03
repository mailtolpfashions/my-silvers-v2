"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/actions/account-actions";
import { TITLES, TITLE_LABELS } from "@/lib/validation/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({
  initial,
}: {
  initial: {
    title: string | null;
    name: string | null;
    email: string;
    phone: string | null;
    dateOfBirth: string | null;
  };
}) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
          {state.success}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <select
            id="title"
            name="title"
            defaultValue={initial.title ?? ""}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">—</option>
            {TITLES.map((t) => (
              <option key={t} value={t}>
                {TITLE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" defaultValue={initial.name ?? ""} required maxLength={80} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={initial.email} disabled readOnly />
        <p className="text-xs text-muted-foreground">
          Your email is your sign-in and can&apos;t be changed here.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="phone">Mobile number</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="9876543210"
            defaultValue={initial.phone ?? ""}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dateOfBirth">Date of birth</Label>
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={initial.dateOfBirth ?? ""}
          />
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
