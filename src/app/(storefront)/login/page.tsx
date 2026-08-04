import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The heading and layout prerender; only the Google button needs the `redirect`
 * search param, so that alone waits on request data.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center px-4 py-20">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      <Suspense fallback={<Skeleton className="h-9 w-full" />}>
        <GoogleButton searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}

async function GoogleButton({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  return <GoogleSignInButton redirectTo={redirect} />;
}
