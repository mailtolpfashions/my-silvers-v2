import { PageHeader } from "@/components/layout/page-header";
import { OwnerOnlyNotice, viewerIsOwner } from "@/components/admin/owner-only";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatUsage,
  isWarning,
  measureAll,
  share,
  WARN_AT,
  type UsageMeter,
} from "@/server/admin/usage";

/** Blocking, like every other admin route — see admin/customers/page.tsx. */
export const instant = false;

const REPO = "https://github.com/mailtolpfashions/my-silvers-v2";

/**
 * Services the site can't read usage from — free accounts get no usage API —
 * so they are links, each with the one limit worth knowing.
 */
const ELSEWHERE = [
  {
    name: "Vercel (hosting)",
    note: "About 100 GB of bandwidth a month. Vercel emails you as you get close. The free plan is for non-commercial use only — move to Pro before launch.",
    href: "https://vercel.com/dashboard/usage",
  },
  {
    name: "Sentry (error tracking)",
    note: "About 5,000 errors a month; after that new errors aren't recorded. Sentry emails you when the quota runs low.",
    href: "https://sentry.io/settings/billing/overview/",
  },
  {
    name: "Upstash (rate limiting)",
    note: "Commands per month are capped. If it runs out, the site stops rate-limiting rather than going down.",
    href: "https://console.upstash.com/",
  },
];

export default async function AdminUsagePage() {
  if (!(await viewerIsOwner())) return <OwnerOnlyNotice area="usage and backups" />;

  const meters = await measureAll();
  const warnings = meters.filter(isWarning);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage & backups"
        description="How close the shop is to each free plan's limits, and the nightly database backup."
      />

      {warnings.length > 0 && (
        <p className="border-l-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {warnings.map((m) => `${m.label} (${m.window})`).join(", ")}{" "}
          {warnings.length === 1 ? "is" : "are"} at {Math.round(WARN_AT * 100)}% or more of the free
          limit. Upgrade the plan or expect an interruption when it runs out.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {meters.map((m) => (
          <MeterCard key={m.key} meter={m} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checked on their own dashboards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            These services don&apos;t let the site read usage on a free plan, but each emails the
            account owner as a limit gets close.
          </p>
          {ELSEWHERE.map((s) => (
            <div key={s.name}>
              <a href={s.href} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                {s.name}
              </a>
              <p className="text-muted-foreground">{s.note}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Database backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            A copy of the whole shop database is made every night at 2:00 AM and kept for 30 days.
            Each copy is locked with your backup passphrase, so only you can open it.
          </p>
          <p className="text-muted-foreground">
            GitHub emails the repository owner if a night&apos;s backup fails. Restoring one is a
            technical job — the steps are in <code>docs/backups.md</code> in the code.
          </p>
          <p className="flex flex-wrap gap-4">
            <a
              href={`${REPO}/actions/workflows/db-backup.yml`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              See recent backups
            </a>
            <a
              href={`${REPO}/actions/workflows/usage-check.yml`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Daily usage check runs
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function MeterCard({ meter: m }: { meter: UsageMeter }) {
  const pct = Math.min(100, Math.round(share(m) * 100));
  const warn = isWarning(m);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2 text-base">
          <span>
            {m.label} <span className="text-sm font-normal text-muted-foreground">· {m.window}</span>
          </span>
          {!m.error && (
            <span className={warn ? "text-destructive" : "text-muted-foreground"}>{pct}%</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {m.error ? (
          <p className="text-muted-foreground">{m.error}</p>
        ) : (
          <>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={`${m.label}, ${m.window}`}
            >
              <div
                className={`h-full rounded-full ${warn ? "bg-destructive" : "bg-foreground"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p>{formatUsage(m)}</p>
            {m.failed ? (
              <p className="text-destructive">
                {m.failed} email{m.failed === 1 ? "" : "s"} refused by Resend in the last 24 hours.
              </p>
            ) : null}
          </>
        )}
        <p className="text-xs text-muted-foreground">If it runs out: {m.impact}</p>
        <a href={m.href} target="_blank" rel="noopener noreferrer" className="text-xs underline">
          Open the provider&apos;s dashboard
        </a>
      </CardContent>
    </Card>
  );
}
