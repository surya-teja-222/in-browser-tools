/** Shared between the API route (server) and the React UI (client). Keep it serialisable. */

export type Period = "day" | "month" | "total";
export type Unit = "count" | "bytes" | "neurons" | "gbs";

export interface MetricResult {
  id: string;
  label: string;
  /** Free-plan allowance in `unit`. */
  limit: number;
  unit: Unit;
  period: Period;
  /** Null when the number could not be fetched; `error` then says why. */
  used: number | null;
  error?: string;
  note?: string;
}

export interface ProductUsage {
  id: string;
  name: string;
  metrics: MetricResult[];
}

export interface UsageReport {
  account: { id: string; name: string | null };
  token: { expiresOn: string | null };
  /** ISO timestamp of when the numbers were fetched. */
  fetchedAt: string;
  /** UTC day and month the counters cover, as YYYY-MM-DD. */
  window: { day: string; monthStart: string };
  products: ProductUsage[];
}

export interface AccountSummary {
  id: string;
  name: string;
}

export type UsageResponse =
  | { kind: "report"; report: UsageReport }
  | { kind: "choose-account"; accounts: AccountSummary[] }
  | { kind: "error"; error: string };
