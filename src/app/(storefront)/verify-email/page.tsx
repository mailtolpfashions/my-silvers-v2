import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell, AuthFooterLink } from "@/components/auth/auth-shell";
import { confirmEmailToken } from "@/server/auth/email-verification";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false },
};

/**
 * Where the "Confirm your email" link lands. Consuming the token on GET is
 * deliberate: the link IS the proof, and asking for a second click would only
 * lose people. A mail scanner that pre-fetches it is acting for the inbox's
 * owner, which is exactly who the link is meant to prove.
 */
export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <AuthShell
      eyebrow="Account"
      title="Confirm your email"
      footer={<AuthFooterLink prompt="Need help?" href="/track-order" label="Track an order" />}
    >
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <Result searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Result({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const email = token ? await confirmEmailToken(token) : null;

  if (!email) {
    return (
      <div className="space-y-3 text-sm">
        <p>This link has expired or has already been used.</p>
        <p className="text-muted-foreground">
          Sign in and use “Resend link” in your account to get a new one.
        </p>
        <Link href="/account" className="inline-block underline underline-offset-4">
          Go to my account
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p>
        Thank you — <span className="font-medium">{email}</span> is confirmed.
      </p>
      <p className="text-muted-foreground">
        Any orders you placed as a guest with this email now show in your account.
      </p>
      <Link href="/account/orders" className="inline-block underline underline-offset-4">
        See my orders
      </Link>
    </div>
  );
}
