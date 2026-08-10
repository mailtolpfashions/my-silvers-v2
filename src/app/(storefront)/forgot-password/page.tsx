import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { AuthShell, AuthFooterLink } from "@/components/auth/auth-shell";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account"
      title="Reset your password"
      description="Enter your email and we'll send you a link to set a new one."
      footer={<AuthFooterLink prompt="Remembered it?" href="/login" label="Sign in" />}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
