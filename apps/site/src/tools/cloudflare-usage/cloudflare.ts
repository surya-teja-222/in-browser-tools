/**
 * Server side of the tool: talks to the Cloudflare API with the user's token and turns the
 * answers into a UsageReport. Runs only inside src/pages/api/cloudflare-usage.ts. Uses nothing
 * but fetch and web standards so it works on any host.
 *
 * Each metric group is its own GraphQL request, so a dataset the token cannot read, or a field
 * Cloudflare renames, only blanks out that group instead of the whole report.
 */
import { FREE_PLAN } from "./limits";
import type { AccountSummary, MetricResult, ProductUsage, UsageReport } from "./types";

const API = "https://api.cloudflare.com/client/v4";
const UPSTREAM_TIMEOUT_MS = 9_000;

type Fetch = typeof fetch;

export interface CollectOptions {
  fetch?: Fetch;
  now?: Date;
}

export class CloudflareError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudflareError";
    this.status = status;
  }
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

interface ApiEnvelope<T> {
  success: boolean;
  errors?: { code?: number; message: string }[];
  result: T;
}

async function rest<T>(path: string, token: string, f: Fetch): Promise<T> {
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
async function graphql<T>(
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

// --- Aggregation helpers (pure, unit tested) ---------------------------------------------------

/** Keeps the latest row per key (by `at`) and sums `value` over those rows. */
export function sumLatestPerKey<T>(
  rows: T[],
  key: (row: T) => string,
  at: (row: T) => string,
  value: (row: T) => number,
): number {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    const current = latest.get(k);
    if (!current || at(row) > at(current)) latest.set(k, row);
  }
  let total = 0;
  for (const row of latest.values()) total += value(row);
  return total;
}

/** Sums `value` over rows whose `actionType` dimension is in `types`. */
export function sumActions<T extends { dimensions: { actionType: string }; sum: object }>(
  rows: T[],
  types: readonly string[],
  value: (row: T) => number,
): number {
  let total = 0;
  for (const row of rows) if (types.includes(row.dimensions.actionType)) total += value(row);
  return total;
}

/** R2 operation classes, from the R2 pricing page. Anything else is treated as Class B. */
export const R2_CLASS_A = [
  "ListBuckets",
  "PutBucket",
  "ListObjects",
  "PutObject",
  "CopyObject",
  "CompleteMultipartUpload",
  "CreateMultipartUpload",
  "LifecycleStorageTierTransition",
  "ListMultipartUploads",
  "UploadPart",
  "UploadPartCopy",
  "ListParts",
  "PutBucketEncryption",
  "PutBucketCors",
  "PutBucketLifecycleConfiguration",
] as const;

export const R2_CLASS_B = [
  "HeadBucket",
  "HeadObject",
  "GetObject",
  "UsageSummary",
  "GetBucketEncryption",
  "GetBucketLocation",
  "GetBucketCors",
  "GetBucketLifecycleConfiguration",
] as const;

export function r2Class(actionType: string): "A" | "B" | null {
  if ((R2_CLASS_A as readonly string[]).includes(actionType)) return "A";
  if ((R2_CLASS_B as readonly string[]).includes(actionType)) return "B";
  // Internal or free operations such as DeleteObject and DeleteBucket are not billed.
  return null;
}

/** Durable Object duration is billed in GB-seconds at 128 MB per active object. */
export function activeTimeToGbSeconds(activeTimeMicros: number): number {
  return (activeTimeMicros / 1_000_000) * 0.128;
}

// --- Collectors ---------------------------------------------------------------------------------

interface Ctx {
  token: string;
  accountTag: string;
  w: TimeWindow;
  f: Fetch;
}

interface Collector {
  metricIds: string[];
  run(ctx: Ctx): Promise<Record<string, number>>;
}

type SumRows<S, D = Record<string, never>> = { sum: S; dimensions: D }[];
type MaxRows<M, D> = { max: M; dimensions: D }[];

const ACCOUNT = "accounts(filter: { accountTag: $accountTag })";

const collectors: Collector[] = [
  {
    metricIds: ["workers.requests"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{ rows: SumRows<{ requests: number }> }>(
        token,
        `query ($accountTag: string!, $start: Time!, $end: Time!) { viewer { ${ACCOUNT} {
          rows: workersInvocationsAdaptive(limit: 10, filter: { datetime_geq: $start, datetime_leq: $end }) {
            sum { requests }
          }
        } } }`,
        { accountTag, start: w.dayStart, end: w.now },
        f,
      );
      return { "workers.requests": data.rows.reduce((n, r) => n + r.sum.requests, 0) };
    },
  },
  {
    metricIds: ["kv.reads", "kv.writes", "kv.deletes", "kv.lists"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{
        rows: SumRows<{ requests: number }, { actionType: string }>;
      }>(
        token,
        `query ($accountTag: string!, $day: Date!) { viewer { ${ACCOUNT} {
          rows: kvOperationsAdaptiveGroups(limit: 100, filter: { date_geq: $day, date_leq: $day }) {
            sum { requests }
            dimensions { actionType }
          }
        } } }`,
        { accountTag, day: w.day },
        f,
      );
      const by = (types: string[]) => sumActions(data.rows, types, (r) => r.sum.requests);
      return {
        "kv.reads": by(["read"]),
        "kv.writes": by(["write"]),
        "kv.deletes": by(["delete"]),
        "kv.lists": by(["list"]),
      };
    },
  },
  {
    metricIds: ["kv.storage"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{
        rows: MaxRows<{ byteCount: number }, { namespaceId: string; date: string }>;
      }>(
        token,
        `query ($accountTag: string!, $start: Date!, $end: Date!) { viewer { ${ACCOUNT} {
          rows: kvStorageAdaptiveGroups(limit: 1000, filter: { date_geq: $start, date_leq: $end }) {
            max { byteCount }
            dimensions { namespaceId date }
          }
        } } }`,
        { accountTag, start: w.yesterday, end: w.day },
        f,
      );
      return {
        "kv.storage": sumLatestPerKey(
          data.rows,
          (r) => r.dimensions.namespaceId,
          (r) => r.dimensions.date,
          (r) => r.max.byteCount,
        ),
      };
    },
  },
  {
    metricIds: ["r2.classA", "r2.classB"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{
        rows: SumRows<{ requests: number }, { actionType: string }>;
      }>(
        token,
        `query ($accountTag: string!, $start: Time!, $end: Time!) { viewer { ${ACCOUNT} {
          rows: r2OperationsAdaptiveGroups(limit: 100, filter: { datetime_geq: $start, datetime_leq: $end }) {
            sum { requests }
            dimensions { actionType }
          }
        } } }`,
        { accountTag, start: w.monthStartTime, end: w.now },
        f,
      );
      let a = 0;
      let b = 0;
      for (const row of data.rows) {
        const cls = r2Class(row.dimensions.actionType);
        if (cls === "A") a += row.sum.requests;
        else if (cls === "B") b += row.sum.requests;
      }
      return { "r2.classA": a, "r2.classB": b };
    },
  },
  {
    metricIds: ["r2.storage"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{
        rows: MaxRows<
          { payloadSize: number; metadataSize: number },
          { bucketName: string; datetime: string }
        >;
      }>(
        token,
        `query ($accountTag: string!, $start: Time!, $end: Time!) { viewer { ${ACCOUNT} {
          rows: r2StorageAdaptiveGroups(limit: 1000, filter: { datetime_geq: $start, datetime_leq: $end }) {
            max { payloadSize metadataSize }
            dimensions { bucketName datetime }
          }
        } } }`,
        { accountTag, start: w.yesterdayStart, end: w.now },
        f,
      );
      return {
        "r2.storage": sumLatestPerKey(
          data.rows,
          (r) => r.dimensions.bucketName,
          (r) => r.dimensions.datetime,
          (r) => r.max.payloadSize + r.max.metadataSize,
        ),
      };
    },
  },
  {
    metricIds: ["d1.rowsRead", "d1.rowsWritten"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{ rows: SumRows<{ rowsRead: number; rowsWritten: number }> }>(
        token,
        `query ($accountTag: string!, $day: Date!) { viewer { ${ACCOUNT} {
          rows: d1AnalyticsAdaptiveGroups(limit: 10, filter: { date_geq: $day, date_leq: $day }) {
            sum { rowsRead rowsWritten }
          }
        } } }`,
        { accountTag, day: w.day },
        f,
      );
      return {
        "d1.rowsRead": data.rows.reduce((n, r) => n + r.sum.rowsRead, 0),
        "d1.rowsWritten": data.rows.reduce((n, r) => n + r.sum.rowsWritten, 0),
      };
    },
  },
  {
    metricIds: ["d1.storage"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{
        rows: MaxRows<{ databaseSizeBytes: number }, { databaseId: string; date: string }>;
      }>(
        token,
        `query ($accountTag: string!, $start: Date!, $end: Date!) { viewer { ${ACCOUNT} {
          rows: d1StorageAdaptiveGroups(limit: 1000, filter: { date_geq: $start, date_leq: $end }) {
            max { databaseSizeBytes }
            dimensions { databaseId date }
          }
        } } }`,
        { accountTag, start: w.yesterday, end: w.day },
        f,
      );
      return {
        "d1.storage": sumLatestPerKey(
          data.rows,
          (r) => r.dimensions.databaseId,
          (r) => r.dimensions.date,
          (r) => r.max.databaseSizeBytes,
        ),
      };
    },
  },
  {
    metricIds: ["do.requests"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{ rows: SumRows<{ requests: number }> }>(
        token,
        `query ($accountTag: string!, $day: Date!) { viewer { ${ACCOUNT} {
          rows: durableObjectsInvocationsAdaptiveGroups(limit: 10, filter: { date_geq: $day, date_leq: $day }) {
            sum { requests }
          }
        } } }`,
        { accountTag, day: w.day },
        f,
      );
      return { "do.requests": data.rows.reduce((n, r) => n + r.sum.requests, 0) };
    },
  },
  {
    metricIds: ["do.duration"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{ rows: SumRows<{ activeTime: number }> }>(
        token,
        `query ($accountTag: string!, $day: Date!) { viewer { ${ACCOUNT} {
          rows: durableObjectsPeriodicGroups(limit: 10, filter: { date_geq: $day, date_leq: $day }) {
            sum { activeTime }
          }
        } } }`,
        { accountTag, day: w.day },
        f,
      );
      const micros = data.rows.reduce((n, r) => n + r.sum.activeTime, 0);
      return { "do.duration": activeTimeToGbSeconds(micros) };
    },
  },
  {
    metricIds: ["do.rowsRead", "do.rowsWritten"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{ rows: SumRows<{ rowsRead: number; rowsWritten: number }> }>(
        token,
        `query ($accountTag: string!, $day: Date!) { viewer { ${ACCOUNT} {
          rows: durableObjectsPeriodicGroups(limit: 10, filter: { date_geq: $day, date_leq: $day }) {
            sum { rowsRead rowsWritten }
          }
        } } }`,
        { accountTag, day: w.day },
        f,
      );
      return {
        "do.rowsRead": data.rows.reduce((n, r) => n + r.sum.rowsRead, 0),
        "do.rowsWritten": data.rows.reduce((n, r) => n + r.sum.rowsWritten, 0),
      };
    },
  },
  {
    metricIds: ["queues.operations"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{ rows: SumRows<{ billableOperations: number }> }>(
        token,
        `query ($accountTag: string!, $day: Date!) { viewer { ${ACCOUNT} {
          rows: queueMessageOperationsAdaptiveGroups(limit: 10, filter: { date_geq: $day, date_leq: $day }) {
            sum { billableOperations }
          }
        } } }`,
        { accountTag, day: w.day },
        f,
      );
      return {
        "queues.operations": data.rows.reduce((n, r) => n + r.sum.billableOperations, 0),
      };
    },
  },
  {
    metricIds: ["ai.neurons"],
    async run({ token, accountTag, w, f }) {
      const data = await graphql<{ rows: SumRows<{ totalNeurons: number }> }>(
        token,
        `query ($accountTag: string!, $day: Date!) { viewer { ${ACCOUNT} {
          rows: aiInferenceAdaptiveGroups(limit: 10, filter: { date_geq: $day, date_leq: $day }) {
            sum { totalNeurons }
          }
        } } }`,
        { accountTag, day: w.day },
        f,
      );
      return { "ai.neurons": data.rows.reduce((n, r) => n + r.sum.totalNeurons, 0) };
    },
  },
];

// --- Report -------------------------------------------------------------------------------------

export type ResolveResult =
  | { kind: "account"; account: { id: string; name: string | null } }
  | { kind: "choose"; accounts: AccountSummary[] };

/** Works out which account to report on. Lists them when the token spans several. */
export async function resolveAccount(
  token: string,
  accountId: string | undefined,
  f: Fetch,
): Promise<ResolveResult> {
  if (accountId) {
    const name = await rest<{ name: string }>(`/accounts/${accountId}`, token, f)
      .then((a) => a.name)
      .catch(() => null);
    return { kind: "account", account: { id: accountId, name } };
  }
  let accounts: AccountSummary[];
  try {
    accounts = await listAccounts(token, f);
  } catch (e) {
    throw new CloudflareError(
      `This token cannot list accounts (${(e as Error).message}). Paste your account ID below instead.`,
      400,
    );
  }
  if (accounts.length === 0) {
    throw new CloudflareError(
      "This token has no account access. Paste your account ID below, and check the token's permissions.",
      400,
    );
  }
  if (accounts.length > 1) return { kind: "choose", accounts };
  return { kind: "account", account: accounts[0] as AccountSummary };
}

export async function collectUsage(
  token: string,
  account: { id: string; name: string | null },
  opts: CollectOptions = {},
): Promise<UsageReport> {
  const f = opts.fetch ?? fetch;
  const now = opts.now ?? new Date();
  const w = buildWindow(now);
  const ctx: Ctx = { token, accountTag: account.id, w, f };

  const [tokenInfo, ...settled] = await Promise.all([
    verifyToken(token, f).catch(() => ({ expiresOn: null })),
    ...collectors.map((c) =>
      c.run(ctx).then(
        (values) => ({ ok: true as const, values }),
        (e: unknown) => ({ ok: false as const, error: describe(e) }),
      ),
    ),
  ]);

  const used = new Map<string, number>();
  const failed = new Map<string, string>();
  collectors.forEach((c, i) => {
    const outcome = settled[i];
    if (!outcome) return;
    for (const id of c.metricIds) {
      if (outcome.ok) used.set(id, outcome.values[id] ?? 0);
      else failed.set(id, outcome.error);
    }
  });

  const products: ProductUsage[] = FREE_PLAN.map((p) => ({
    id: p.id,
    name: p.name,
    metrics: p.metrics.map((m): MetricResult => {
      const error = failed.get(m.id);
      return {
        id: m.id,
        label: m.label,
        limit: m.limit,
        unit: m.unit,
        period: m.period,
        used: error ? null : (used.get(m.id) ?? 0),
        ...(error ? { error } : {}),
        ...(m.note ? { note: m.note } : {}),
      };
    }),
  }));

  return {
    account,
    token: tokenInfo,
    fetchedAt: now.toISOString(),
    window: { day: w.day, monthStart: w.monthStart },
    products,
  };
}

function describe(e: unknown): string {
  if (e instanceof CloudflareError) return e.message;
  if (e instanceof Error && e.name === "TimeoutError") return "Cloudflare took too long to answer.";
  return "Could not fetch this number.";
}
