import Link from "next/link";

/**
 * The frame shared by sign in, register, forgot password and reset password.
 *
 * These four pages each centred their own `max-w-sm` column with their own
 * padding and their own heading treatment, which is why they read as a
 * different application from the shop — a shopper crossed from a full-bleed
 * catalogue into what looked like a generic admin login.
 *
 * One shell now: eyebrow, heading, a line of context, a hairline, the form.
 * Narrow measure and transactional rhythm, because signing in is a task.
 */
export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  aside,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** The "no account yet?" line under the form. */
  footer?: React.ReactNode;
  /**
   * Artwork beside the form: the left half on desktop. On a phone it drops
   * BELOW the form, because the shopper came to sign in, and a picture above
   * the fields would push them off the first screen. Sign in and register
   * pass the CMS banner here; forgot and reset password stay single-column.
   */
  aside?: React.ReactNode;
}) {
  const form = (
    <div className="mx-auto w-full max-w-sm py-8 sm:py-16">
      <p className="label-eyebrow mb-3">{eyebrow}</p>
      <h1 className="text-h1">{title}</h1>
      {description && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}

      <div className="mt-8 border-t pt-8">{children}</div>

      {footer && <div className="mt-8 border-t pt-6 text-sm text-muted-foreground">{footer}</div>}
    </div>
  );

  if (!aside) {
    return <div className="container-prose rhythm-transactional">{form}</div>;
  }

  return (
    <div className="container-page rhythm-transactional">
      <div className="grid items-stretch gap-8 lg:grid-cols-2 lg:gap-16">
        <div className="order-2 lg:order-1">{aside}</div>
        <div className="order-1 flex items-center lg:order-2">{form}</div>
      </div>
    </div>
  );
}

/** The one-line link under an auth form. Kept here so all four match. */
export function AuthFooterLink({
  prompt,
  href,
  label,
}: {
  prompt: string;
  href: string;
  label: string;
}) {
  return (
    <p>
      {prompt}{" "}
      <Link
        href={href}
        className="border-b border-foreground pb-0.5 text-foreground transition-colors hover:border-black hover:text-black"
      >
        {label}
      </Link>
    </p>
  );
}
