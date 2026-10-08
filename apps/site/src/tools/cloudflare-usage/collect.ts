/** Puts a UsageReport together: which account, then every collector in parallel. Server only. */
import { buildWindow, CloudflareError, type Fetch, listAccounts, rest, verifyToken } from "./api";
import { collectors } from "./collectors";
import { FREE_PLAN } from "./limits";
import type { AccountSummary, MetricResult, ProductUsage, UsageReport } from "./types";

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

export interface CollectOptions {
  fetch?: Fetch;
  now?: Date;
}

export async function collectUsage(
  token: string,
  account: { id: string; name: string | null },
  opts: CollectOptions = {},
): Promise<UsageReport> {
  const f = opts.fetch ?? fetch;
  const now = opts.now ?? new Date();
  const window = buildWindow(now);
  const ctx = { token, accountTag: account.id, window, fetch: f };

  const [tokenInfo, ...outcomes] = await Promise.all([
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
    const outcome = outcomes[i];
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
    window: { day: window.day, monthStart: window.monthStart },
    products,
  };
}

function describe(e: unknown): string {
  if (e instanceof CloudflareError) return e.message;
  if (e instanceof Error && e.name === "TimeoutError") return "Cloudflare took too long to answer.";
  return "Could not fetch this number.";
}
