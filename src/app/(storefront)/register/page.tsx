import { RegisterForm } from "@/components/auth/register-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { AuthShell } from "@/components/auth/auth-shell";

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="Account"
      title="Create an account"
      description="Save pieces to your wishlist and track every order in one place."
    >
      <GoogleSignInButton />
      <RegisterForm />
    </AuthShell>
  );
}
