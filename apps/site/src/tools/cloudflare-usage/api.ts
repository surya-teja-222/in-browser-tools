/**
 * Thin client for the Cloudflare REST and GraphQL Analytics APIs. Server side only; uses nothing
 * but fetch and web standards so it runs on any host.
 */
import type { AccountSummary } from "./types";

const API = "https://api.cloudflare.com/client/v4";
const UPSTREAM_TIMEOUT_MS = 9_000;

export type Fetch = typeof fetch;

export class CloudflareError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudflareError";
    this.status = status;
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  errors?: { code?: number; message: string }[];
  result: T;
}

export async function rest<T>(path: string, token: string, f: Fetch): Promise<T> {
  const res = await f(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !body?.success) {
    const message = body?.errors?.[0]?.message ?? `Cloudflare answered ${res.status}`;
    throw new CloudflareError(message, res.status);
  }
  return body.result;
}

interface GraphqlEnvelope<T> {
  data?: { viewer?: { accounts?: T[] } } | null;
  errors?: { message: string }[] | null;
}

/** Runs one query against the GraphQL Analytics API and returns the first account node. */
export async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, string>,
  f: Fetch,
): Promise<T> {
  const res = await f(`${API}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as GraphqlEnvelope<T> | null;
  if (body?.errors?.length) throw new CloudflareError(body.errors[0]?.message ?? "", res.status);
  if (!res.ok) throw new CloudflareError(`Cloudflare answered ${res.status}`, res.status);
  const account = body?.data?.viewer?.accounts?.[0];
  if (!account) throw new CloudflareError("No data came back for this account.", 502);
  return account;
}

export async function verifyToken(token: string, f: Fetch): Promise<{ expiresOn: string | null }> {
  const result = await rest<{ status: string; expires_on?: string }>(
    "/user/tokens/verify",
    token,
    f,
  );
  if (result.status !== "active") throw new CloudflareError(`This token is ${result.status}.`, 401);
  return { expiresOn: result.expires_on ?? null };
}

export async function listAccounts(token: string, f: Fetch): Promise<AccountSummary[]> {
  const result = await rest<{ id: string; name: string }[]>("/accounts?per_page=50", token, f);
  return result.map((a) => ({ id: a.id, name: a.name }));
}

/** The UTC day and month the counters cover, in the formats the GraphQL filters want. */
export interface TimeWindow {
  /** YYYY-MM-DD, today in UTC. */
  day: string;
  /** YYYY-MM-DD, the day before. Storage datasets lag a little, so we look at both. */
  yesterday: string;
  /** YYYY-MM-DD, first day of the current UTC month. */
  monthStart: string;
  /** ISO timestamps for datasets filtered by datetime. */
  dayStart: string;
  yesterdayStart: string;
  monthStartTime: string;
  now: string;
}

export function buildWindow(now = new Date()): TimeWindow {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterdayStart = new Date(dayStart.getTime() - 86_400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const date = (d: Date) => d.toISOString().slice(0, 10);
  return {
    day: date(dayStart),
    yesterday: date(yesterdayStart),
    monthStart: date(monthStart),
    dayStart: dayStart.toISOString(),
    yesterdayStart: yesterdayStart.toISOString(),
    monthStartTime: monthStart.toISOString(),
    now: now.toISOString(),
  };
}
