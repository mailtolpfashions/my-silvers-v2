"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { updateProfileAction } from "@/actions/account-actions";
import { TITLES, TITLE_LABELS } from "@/lib/validation/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Radix Select refuses an item whose value is the empty string — it reserves ""
 * for "nothing selected". "No title" is a real choice here, though, so it gets
 * a sentinel in the UI and is converted back to "" in the hidden input that
 * actually posts. The schema takes "" and transforms it to undefined; see
 * lib/validation/account.ts.
 */
const NO_TITLE = "none";

/** Never fires — the "store" here is just "am I in a browser yet". */
const subscribeNever = () => () => {};

/**
 * Today, from LOCAL date parts.
 *
 * Not `toISOString().slice(0, 10)`, which is always UTC and therefore says
 * yesterday to anyone in IST between midnight and 05:30.
 */
function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

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
  const [title, setTitle] = useState(initial.title || NO_TITLE);

  /**
   * ⚠️  The latest selectable date of birth — today — resolves only in the
   * browser, and is deliberately absent from the server render.
   *
   * It was `max={new Date().toISOString().slice(0, 10)}`, which is two bugs in
   * one line. `"use client"` does not mean "only runs in the browser": this
   * component is still rendered on the server to produce the initial HTML, so
   * that ran twice, in two different time zones. `toISOString()` is always UTC
   * while the shopper is in IST — so between midnight and 05:30 IST the server
   * said yesterday and the browser said today. That is a hydration mismatch on
   * the attribute, and for those five and a half hours a date picker that
   * refused today's date.
   *
   * useSyncExternalStore rather than a mount effect: it is the sanctioned way
   * to let the server and client snapshots differ, and calling setState from an
   * effect to do the same thing costs a second render for no reason (the lint
   * rule that rejects it is right).
   *
   * Nothing rests on this. The attribute only greys out future days in the
   * native picker; `if (date > new Date()) return false` in the schema is what
   * actually rejects a future date, and that runs on the server where it
   * belongs.
   */
  const isHydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
  const maxDateOfBirth = isHydrated ? todayLocal() : undefined;

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
          {/* Was a bare <select> wearing a copy of Input's classes, which is why
              it carried the browser's own chevron and drifted from the fields
              beside it — a copy cannot follow Input's focus ring or its
              disabled and aria-invalid states. */}
          <Select value={title} onValueChange={setTitle}>
            <SelectTrigger id="title" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TITLE}>—</SelectItem>
              {TITLES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TITLE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Radix renders its own hidden input only when `name` is set on the
              Root, and that one would post the sentinel. This posts the value
              the schema expects. */}
          <input type="hidden" name="title" value={title === NO_TITLE ? "" : title} />
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
            max={maxDateOfBirth}
            defaultValue={initial.dateOfBirth ?? ""}
          />
        </div>
      </div>

      {/* The storefront's own call to action, not the rounded /admin one — see
          the note on the `cta` variant in ui/button.tsx. Checkout already used
          it; this form and the address form were the two places still speaking
          the dashboard's language to a shopper. */}
      <Button type="submit" variant="cta" size="cta" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
