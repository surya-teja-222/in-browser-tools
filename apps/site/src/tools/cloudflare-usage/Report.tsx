import { ArrowClockwiseIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Button } from "@/ui/Button";
import { ErrorLine } from "./bits";
import {
  formatDateTime,
  formatPercent,
  formatValue,
  percent,
  periodLabel,
  untilUtcMidnight,
} from "./format";
import { FREE_PLAN } from "./limits";
import type { MetricResult, ProductUsage, UsageReport } from "./types";

export function Report(props: {
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
  const verdict = summarise(report);

  return (
    <div className="flex flex-col gap-8" aria-busy={props.busy}>
      {props.sample && (
        <p className="flex items-center gap-2 rounded-panel border border-sun bg-sun/10 px-4 py-3 text-sm">
          <WarningCircleIcon className="size-4.5 shrink-0" aria-hidden="true" />
          Sample data. These numbers are made up to show the layout.
        </p>
      )}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {report.account.name ?? "Your account"}
          </h2>
          <p className="mt-1 truncate font-mono text-xs text-ink-muted">{report.account.id}</p>
          <p
            className={cn("mt-4 max-w-[60ch] text-lg", verdict.tone === "danger" && "text-danger")}
          >
            {verdict.text}
          </p>
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

      {/* Multi-column layout lets groups of different heights pack without holes. */}
      <div className="gap-x-10 md:columns-2">
        {report.products.map((p) => (
          <ProductGroup key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

/** One sentence that says what matters before the reader scans 18 rows. */
function summarise(report: UsageReport): { text: string; tone: "ok" | "danger" } {
  const metrics = report.products.flatMap((p) =>
    p.metrics.map((m) => ({ product: p.name, metric: m, pct: percent(m) })),
  );
  const over = metrics.filter((m) => m.pct !== null && m.pct >= 100);
  if (over.length > 0) {
    const names = over.map((m) => `${m.product} ${m.metric.label.toLowerCase()}`);
    return {
      tone: "danger",
      text:
        over.length === 1
          ? `${names[0]} is over its free allowance.`
          : `Over the free allowance: ${names.join(", ")}.`,
    };
  }
  const top = metrics.filter((m) => m.pct !== null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  if (!top || (top.pct ?? 0) < 1) {
    return { tone: "ok", text: "Everything is under 1% of the free plan." };
  }
  const allowance =
    top.metric.period === "day"
      ? "the daily allowance"
      : top.metric.period === "month"
        ? "the monthly allowance"
        : "its allowance";
  return {
    tone: "ok",
    text: `Closest to a limit: ${top.product} ${top.metric.label.toLowerCase()} at ${formatPercent(top.pct ?? 0)} of ${allowance}.`,
  };
}

function ProductGroup({ product }: { product: ProductUsage }) {
  const worst = Math.max(...product.metrics.map((m) => percent(m) ?? 0));
  return (
    <section
      aria-labelledby={`product-${product.id}`}
      className="mb-8 break-inside-avoid border-t border-rule pt-3"
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
      <ul className="mt-3 flex flex-col gap-3.5">
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
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0">
          <span className="font-medium">{metric.label}</span>
          <span className="ml-1.5 text-sm text-ink-muted">{periodLabel(metric.period)}</span>
          {metric.note && (
            <span className="mt-0.5 block text-xs text-ink-muted">{metric.note}</span>
          )}
        </span>
        {metric.used === null ? (
          <span className="shrink-0 text-sm text-ink-muted">Not available</span>
        ) : (
          <span className="flex shrink-0 items-baseline gap-3 font-mono text-sm tabular-nums">
            <span className={cn(over && "text-danger")}>
              {formatValue(metric.used, metric.unit)}
              <span className="text-ink-muted"> / {formatValue(metric.limit, metric.unit)}</span>
            </span>
            <span
              className={cn(
                "w-10 text-right text-ink-muted",
                over && "font-medium text-danger",
                (pct ?? 0) >= 80 && !over && "text-ink",
              )}
            >
              {formatPercent(pct ?? 0)}
            </span>
          </span>
        )}
      </div>

      {metric.used === null ? (
        <p className="text-xs text-ink-muted">{metric.error}</p>
      ) : (
        <div
          role="progressbar"
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round(pct ?? 0))}
          aria-valuetext={`${formatPercent(pct ?? 0)} of the free allowance`}
          className="h-1 w-full bg-rule/60"
        >
          <div
            className={cn("h-full", over ? "bg-danger" : "bg-sun")}
            style={{
              // Anything above zero gets a visible sliver so tiny use is not mistaken for none.
              width: pct === 0 ? 0 : `max(3px, ${Math.min(100, pct ?? 0)}%)`,
            }}
          />
        </div>
      )}
    </li>
  );
}

/** Placeholder in the shape of the report, shown while Cloudflare is being asked. */
export function LedgerSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="h-6 w-56 rounded-control bg-rule/60" />
      <div className="mt-3 h-4 w-80 max-w-full rounded-control bg-rule/60" />
      <div className="mt-8 gap-x-10 md:columns-2">
        {FREE_PLAN.map((p) => (
          <section key={p.id} className="mb-8 break-inside-avoid border-t border-rule pt-3">
            <div className="h-5 w-32 rounded-control bg-rule/60" />
            <ul className="mt-4 flex flex-col gap-3.5">
              {p.metrics.map((m) => (
                <li key={m.id} className="flex flex-col gap-2">
                  <div className="flex justify-between">
                    <div className="h-4 w-36 rounded-control bg-rule/60" />
                    <div className="h-4 w-28 rounded-control bg-rule/60" />
                  </div>
                  <div className="h-1 w-full bg-rule/40" />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
