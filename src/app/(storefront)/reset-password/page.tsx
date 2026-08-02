import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-20">
      <h1 className="mb-6 text-2xl font-semibold">Set a new password</h1>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
