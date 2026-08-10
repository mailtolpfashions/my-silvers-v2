import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account"
      title="Set a new password"
      description="Choose something you haven't used elsewhere."
    >
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
