"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [message, formAction, isPending] = useActionState(forgotPasswordAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {message && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
