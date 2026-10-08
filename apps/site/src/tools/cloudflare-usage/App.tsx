import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  CircleNotchIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { type ReactNode, type SyntheticEvent, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/ui/Button";
import { formatDateTime, formatValue, percent, periodLabel, untilUtcMidnight } from "./format";
import { SAMPLE_REPORT } from "./sample";
import type {
  AccountSummary,
  MetricResult,
  ProductUsage,
  UsageReport,
  UsageResponse,
} from "./types";

const ENDPOINT = "/api/cloudflare-usage/";

/** Opens the Cloudflare token form with the one permission this tool needs already ticked. */
const CREATE_TOKEN_URL = `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encodeURIComponent(
  JSON.stringify([{ key: "account_analytics", type: "read" }]),
)}&accountId=*&zoneId=all&name=${encodeURIComponent("Usage check (tools.itssurya.com)")}`;

type View =
  | { kind: "form" }
  | { kind: "choose"; accounts: AccountSummary[] }
  | { kind: "report"; report: UsageReport; sample: boolean };

export default function App() {
  // The token lives in component state only. Reloading the page or pressing "Start over"
  // forgets it; nothing is written to storage.
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [view, setView] = useState<View>({ kind: "form" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(nextAccountId = accountId) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${token.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: nextAccountId.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as UsageResponse | null;
      if (!data) {
        setError(`The server answered ${res.status} without a readable body. Try again.`);
      } else if (data.kind === "error") {
        setError(data.error);
      } else if (data.kind === "choose-account") {
        setView({ kind: "choose", accounts: data.accounts });
      } else {
        setView({ kind: "report", report: data.report, sample: false });
      }
    } catch {
      setError("Could not reach this site's server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setToken("");
    setAccountId("");
    setError(null);
    setView({ kind: "form" });
  }

  if (view.kind === "report") {
    return (
      <Report
        report={view.report}
        sample={view.sample}
        busy={busy}
        error={error}
        onRefresh={view.sample ? undefined : () => check(view.report.account.id)}
        onReset={reset}
      />
    );
  }

  if (view.kind === "choose") {
    return (
      <Panel>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Which account?</h2>
        <p className="mt-2 text-ink-muted">This token can see more than one account.</p>
        <ul className="mt-6 flex flex-col gap-2">
          {view.accounts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setAccountId(a.id);
                  check(a.id);
                }}
                className="flex w-full flex-col items-start gap-0.5 rounded-control border border-rule bg-paper px-4 py-3 text-left transition-colors hover:border-ink-muted disabled:opacity-50"
              >
                <span className="font-medium">{a.name}</span>
                <span className="font-mono text-xs text-ink-muted">{a.id}</span>
              </button>
            </li>
          ))}
        </ul>
        {error && <ErrorLine>{error}</ErrorLine>}
        <div className="mt-6">
          <Button variant="ghost" onClick={reset}>
            <XIcon /> Start over
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <TokenForm
      token={token}
      accountId={accountId}
      busy={busy}
      error={error}
      onToken={setToken}
      onAccountId={setAccountId}
      onSubmit={() => check()}
      onSample={() => setView({ kind: "report", report: SAMPLE_REPORT, sample: true })}
    />
  );
}

function TokenForm(props: {
  token: string;
  accountId: string;
  busy: boolean;
  error: string | null;
  onToken: (v: string) => void;
  onAccountId: (v: string) => void;
  onSubmit: () => void;
  onSample: () => void;
}) {
  const tokenId = useId();
  const accountIdId = useId();

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (props.token.trim()) props.onSubmit();
  }

  return (
    <Panel>
      <form onSubmit={submit} className="flex flex-col gap-6" aria-busy={props.busy}>
        <div className="max-w-[56ch]">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Check your free plan usage
          </h2>
          <p className="mt-2 text-ink-muted">
            Paste an API token with{" "}
            <strong className="font-medium text-ink">Account Analytics: Read</strong>. Give it a
            short expiry, since it is only needed for this one check.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={tokenId} className="text-sm font-medium">
              API token
            </label>
            <input
              id={tokenId}
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
              value={props.token}
              onChange={(e) => props.onToken(e.target.value)}
              placeholder="Paste the token Cloudflare shows once"
              className="h-10 rounded-control border border-rule bg-paper px-3 font-mono text-sm placeholder:font-sans placeholder:text-ink-muted/70"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={accountIdId} className="text-sm font-medium">
              Account ID <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input
              id={accountIdId}
              type="text"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              pattern="[0-9a-fA-F]{32}"
              title="32 hex characters"
              value={props.accountId}
              onChange={(e) => props.onAccountId(e.target.value)}
              placeholder="Only if the token cannot list accounts"
              className="h-10 rounded-control border border-rule bg-paper px-3 font-mono text-sm placeholder:font-sans placeholder:text-ink-muted/70"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={props.busy || !props.token.trim()}>
            {props.busy ? <CircleNotchIcon className="animate-spin" /> : <ShieldCheckIcon />}
            {props.busy ? "Checking" : "Check usage"}
          </Button>
          <Button onClick={() => window.open(CREATE_TOKEN_URL, "_blank", "noopener,noreferrer")}>
            Create a token <ArrowSquareOutIcon />
          </Button>
          <Button variant="ghost" onClick={props.onSample} disabled={props.busy}>
            Try a sample
          </Button>
        </div>

        {props.error && <ErrorLine>{props.error}</ErrorLine>}

        <p className="flex max-w-[60ch] gap-2 text-sm text-ink-muted">
          <ShieldCheckIcon className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
          <span>
            Unlike the other tools here, this one uses a server. Cloudflare's API refuses calls from
            browsers, so your token goes to this site's server for this one check, is used to ask
            Cloudflare for the numbers, and is then dropped. It is never stored or logged, and this
            page forgets it when you reload.
          </span>
        </p>
      </form>
    </Panel>
  );
}

function Report(props: {
  report: UsageReport;
  sample: boolean;
  busy: boolean;
  error: string | null;
  onRefresh: (() => void) | undefined;
  onReset: () => void;
}) {
  const { report } = props;
  const now = new Date();
  const expires = report.token.expiresOn ? new Date(report.token.expiresOn) : null;

  return (
    <div className="flex flex-col gap-6" aria-busy={props.busy}>
      {props.sample && (
        <p className="flex items-center gap-2 rounded-panel border border-sun bg-sun/10 px-4 py-3 text-sm">
          <WarningCircleIcon className="size-4.5 shrink-0" aria-hidden="true" />
          Sample data. These numbers are made up to show the layout.
        </p>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {report.account.name ?? "Your account"}
          </h2>
          <p className="mt-1 font-mono text-xs text-ink-muted">{report.account.id}</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
            <div className="flex gap-1.5">
              <dt>Fetched</dt>
              <dd className="text-ink">{formatDateTime(report.fetchedAt)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Daily limits reset in</dt>
              <dd className="text-ink">{untilUtcMidnight(now)}</dd>
            </div>
            {expires && (
              <div className="flex gap-1.5">
                <dt>Token expires</dt>
                <dd className={cn(expires < now ? "text-danger" : "text-ink")}>
                  {formatDateTime(report.token.expiresOn as string)}
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {props.onRefresh && (
            <Button onClick={props.onRefresh} disabled={props.busy}>
              <ArrowClockwiseIcon className={cn(props.busy && "animate-spin")} /> Refresh
            </Button>
          )}
          <Button variant="ghost" onClick={props.onReset}>
            <XIcon /> Start over
          </Button>
        </div>
      </header>

      {props.error && <ErrorLine>{props.error}</ErrorLine>}

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        {report.products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

function ProductCard({ product }: { product: ProductUsage }) {
  const worst = Math.max(...product.metrics.map((m) => percent(m) ?? 0));
  return (
    <section
      aria-labelledby={`product-${product.id}`}
      className="flex flex-col gap-5 rounded-panel border border-rule bg-surface p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`product-${product.id}`} className="font-display text-lg font-semibold">
          {product.name}
        </h3>
        {worst >= 100 ? (
          <span className="text-sm font-medium text-danger">Over a limit</span>
        ) : worst >= 80 ? (
          <span className="text-sm text-ink-muted">Getting close</span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-4">
        {product.metrics.map((m) => (
          <MetricRow key={m.id} metric={m} />
        ))}
      </ul>
    </section>
  );
}

function MetricRow({ metric }: { metric: MetricResult }) {
  const pct = percent(metric);
  const over = pct !== null && pct >= 100;
  const labelId = `metric-${metric.id.replace(".", "-")}`;

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span id={labelId} className="font-medium">
          {metric.label}
          <span className="ml-1.5 text-sm font-normal text-ink-muted">
            {periodLabel(metric.period)}
          </span>
        </span>
        {metric.used === null ? (
          <span className="text-sm text-ink-muted">Not available</span>
        ) : (
          <span className={cn("font-mono text-sm tabular-nums", over && "text-danger")}>
            {formatValue(metric.used, metric.unit)}
            <span className="text-ink-muted"> / {formatValue(metric.limit, metric.unit)}</span>
          </span>
        )}
      </div>

      {metric.used === null ? (
        <p className="text-sm text-ink-muted">{metric.error}</p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-labelledby={labelId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(pct ?? 0))}
            aria-valuetext={`${Math.round(pct ?? 0)}% of the free allowance`}
            className="h-2 w-full bg-rule"
          >
            <div
              className={cn(
                "h-full transition-[width] duration-500",
                over ? "bg-danger" : "bg-sun",
              )}
              style={{ width: `${Math.min(100, pct ?? 0)}%` }}
            />
          </div>
          <p className="flex justify-between gap-3 text-xs text-ink-muted">
            <span>{metric.note}</span>
            <span className={cn("shrink-0 tabular-nums", over && "font-medium text-danger")}>
              {Math.round(pct ?? 0)}%{over && " used, over the limit"}
            </span>
          </p>
        </>
      )}
    </li>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-panel border border-rule bg-surface p-6 sm:p-8">{children}</div>;
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex max-w-[70ch] gap-2 text-danger">
      <WarningCircleIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> {children}
    </p>
  );
}
