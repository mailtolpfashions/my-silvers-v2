import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-20">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
