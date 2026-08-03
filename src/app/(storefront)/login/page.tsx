import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-20">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      <GoogleSignInButton redirectTo={redirect} />
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
