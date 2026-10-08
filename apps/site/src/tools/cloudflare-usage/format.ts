import { GB } from "./limits";
import type { MetricResult, Period, Unit } from "./types";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en");

/** Short form for progress labels: 12.3K, 1.2M. Exact under 10,000. */
export function formatCount(n: number): string {
  return n < 10_000 ? plain.format(Math.round(n)) : compact.format(n);
}

/** Cloudflare bills in decimal units (1 GB = 1,000,000,000 bytes), so we show the same. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${trim(bytes / GB)} GB`;
  if (bytes >= 1_000_000) return `${trim(bytes / 1_000_000)} MB`;
  if (bytes >= 1_000) return `${trim(bytes / 1_000)} kB`;
  return `${Math.round(bytes)} B`;
}

function trim(n: number): string {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(n >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}

export function formatValue(n: number, unit: Unit): string {
  switch (unit) {
    case "bytes":
      return formatBytes(n);
    case "gbs":
      return `${formatCount(n)} GB-s`;
    case "neurons":
    case "count":
      return formatCount(n);
  }
}

/** 0 to 100, uncapped so the UI can say "120%" when a limit is exceeded. */
export function percent(metric: MetricResult): number | null {
  if (metric.used === null || metric.limit <= 0) return null;
  return (metric.used / metric.limit) * 100;
}

export function periodLabel(period: Period): string {
  switch (period) {
    case "day":
      return "today";
    case "month":
      return "this month";
    case "total":
      return "stored now";
  }
}

/** Hours and minutes until the daily counters reset at 00:00 UTC. */
export function untilUtcMidnight(now = new Date()): string {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const minutes = Math.max(0, Math.round((next - now.getTime()) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
