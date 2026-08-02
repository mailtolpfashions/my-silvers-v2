"use client";

import { useActionState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { resetPasswordAction } from "@/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [result, formAction, isPending] = useActionState(resetPasswordAction, undefined);

  useEffect(() => {
    if (result === "success") {
      const timeout = setTimeout(() => router.push("/login"), 1500);
      return () => clearTimeout(timeout);
    }
  }, [result, router]);

  if (!token) {
    return <p className="text-sm text-destructive">Missing or invalid reset link.</p>;
  }

  if (result === "success") {
    return (
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        Password updated — redirecting you to sign in…
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {result && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {result}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving…" : "Reset password"}
      </Button>
    </form>
  );
}
