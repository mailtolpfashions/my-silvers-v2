import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthShowcase, AuthShowcaseSkeleton } from "@/components/auth/auth-showcase";
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
    <AuthShell
      eyebrow="Account"
      title="Sign in"
      description="Your orders, addresses and wishlist, kept together."
      aside={
        <Suspense fallback={<AuthShowcaseSkeleton />}>
          <AuthShowcase />
        </Suspense>
      }
    >
      <Suspense fallback={<Skeleton className="h-11 w-full" />}>
        <GoogleButton searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
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
