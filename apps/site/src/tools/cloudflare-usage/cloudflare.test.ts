import { describe, expect, it } from "vitest";
import {
  activeTimeToGbSeconds,
  buildWindow,
  collectUsage,
  r2Class,
  resolveAccount,
  sumActions,
  sumLatestPerKey,
} from "./cloudflare";
import { formatBytes, formatCount, percent } from "./format";
import { FREE_PLAN, GB } from "./limits";

describe("buildWindow", () => {
  it("uses UTC dates and the first of the month", () => {
    const w = buildWindow(new Date("2026-10-08T23:30:00+05:30"));
    expect(w.day).toBe("2026-10-08");
    expect(w.yesterday).toBe("2026-10-07");
    expect(w.monthStart).toBe("2026-10-01");
    expect(w.dayStart).toBe("2026-10-08T00:00:00.000Z");
    expect(w.monthStartTime).toBe("2026-10-01T00:00:00.000Z");
  });

  it("rolls into the next UTC day when local time is still the previous one", () => {
    const w = buildWindow(new Date("2026-10-08T20:00:00-05:00"));
    expect(w.day).toBe("2026-10-09");
  });
});

describe("aggregation helpers", () => {
  it("sums only the latest row per key", () => {
    const rows = [
      { key: "a", at: "2026-10-07", v: 10 },
      { key: "a", at: "2026-10-08", v: 12 },
      { key: "b", at: "2026-10-08", v: 5 },
      { key: "b", at: "2026-10-07", v: 50 },
    ];
    expect(
      sumLatestPerKey(
        rows,
        (r) => r.key,
        (r) => r.at,
        (r) => r.v,
      ),
    ).toBe(17);
  });

  it("sums the requested action types", () => {
    const rows = [
      { dimensions: { actionType: "read" }, sum: { requests: 7 } },
      { dimensions: { actionType: "write" }, sum: { requests: 2 } },
      { dimensions: { actionType: "read" }, sum: { requests: 3 } },
    ];
    expect(sumActions(rows, ["read"], (r) => r.sum.requests)).toBe(10);
    expect(sumActions(rows, ["list"], (r) => r.sum.requests)).toBe(0);
  });

  it("classifies R2 operations", () => {
    expect(r2Class("PutObject")).toBe("A");
    expect(r2Class("ListObjects")).toBe("A");
    expect(r2Class("GetObject")).toBe("B");
    expect(r2Class("HeadObject")).toBe("B");
    expect(r2Class("DeleteObject")).toBeNull();
  });

  it("converts Durable Object active time to GB-seconds", () => {
    // 1,000 seconds at 128 MB.
    expect(activeTimeToGbSeconds(1_000_000_000)).toBeCloseTo(128);
  });
});

describe("format", () => {
  it("formats counts and bytes in decimal units", () => {
    expect(formatCount(940)).toBe("940");
    expect(formatCount(61_840)).toBe("61.8K");
    expect(formatBytes(0.21 * GB)).toBe("210 MB");
    expect(formatBytes(7.4 * GB)).toBe("7.4 GB");
  });

  it("reports percent over 100 when a limit is exceeded", () => {
    expect(
      percent({ id: "x", label: "", limit: 100, unit: "count", period: "day", used: 120 }),
    ).toBe(120);
    expect(
      percent({ id: "x", label: "", limit: 100, unit: "count", period: "day", used: null }),
    ).toBeNull();
  });
});

/** A fetch that answers REST and GraphQL calls from canned data and records what was asked. */
function fakeCloudflare(opts: {
  accounts?: { id: string; name: string }[];
  graphql: (query: string) => unknown;
}) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.endsWith("/user/tokens/verify")) {
      return json({
        success: true,
        result: { status: "active", expires_on: "2026-10-09T00:00:00Z" },
      });
    }
    if (url.includes("/accounts?")) return json({ success: true, result: opts.accounts ?? [] });
    if (url.endsWith("/graphql")) {
      const { query } = JSON.parse(String(init?.body)) as { query: string };
      const answer = opts.graphql(query);
      if (answer instanceof Error)
        return json({ data: null, errors: [{ message: answer.message }] });
      return json({ data: { viewer: { accounts: [answer] } } });
    }
    return json({ success: false, errors: [{ message: "not found" }] }, 404);
  }) as typeof fetch;
  return { f, calls };
}

describe("resolveAccount", () => {
  it("picks the only account", async () => {
    const { f } = fakeCloudflare({
      accounts: [{ id: "a".repeat(32), name: "Solo" }],
      graphql: () => ({}),
    });
    expect(await resolveAccount("tok", undefined, f)).toEqual({
      kind: "account",
      account: { id: "a".repeat(32), name: "Solo" },
    });
  });

  it("asks the user to choose between several", async () => {
    const accounts = [
      { id: "a".repeat(32), name: "One" },
      { id: "b".repeat(32), name: "Two" },
    ];
    const { f } = fakeCloudflare({ accounts, graphql: () => ({}) });
    expect(await resolveAccount("tok", undefined, f)).toEqual({ kind: "choose", accounts });
  });

  it("explains when the token cannot list accounts", async () => {
    const { f } = fakeCloudflare({ accounts: [], graphql: () => ({}) });
    await expect(resolveAccount("tok", undefined, f)).rejects.toThrow(/account ID/);
  });
});

describe("collectUsage", () => {
  const account = { id: "c".repeat(32), name: "Test" };

  it("fills every free-plan metric and isolates a failing dataset", async () => {
    const { f, calls } = fakeCloudflare({
      graphql(query) {
        if (query.includes("workersInvocationsAdaptive"))
          return { rows: [{ sum: { requests: 61_840 } }] };
        if (query.includes("kvOperationsAdaptiveGroups")) {
          return {
            rows: [
              { sum: { requests: 8_000 }, dimensions: { actionType: "read" } },
              { sum: { requests: 412 }, dimensions: { actionType: "read" } },
              { sum: { requests: 940 }, dimensions: { actionType: "write" } },
            ],
          };
        }
        if (query.includes("kvStorageAdaptiveGroups")) {
          return {
            rows: [
              { max: { byteCount: 100 }, dimensions: { namespaceId: "ns1", date: "2026-10-07" } },
              { max: { byteCount: 150 }, dimensions: { namespaceId: "ns1", date: "2026-10-08" } },
              { max: { byteCount: 50 }, dimensions: { namespaceId: "ns2", date: "2026-10-08" } },
            ],
          };
        }
        if (query.includes("r2OperationsAdaptiveGroups")) {
          return {
            rows: [
              { sum: { requests: 10 }, dimensions: { actionType: "PutObject" } },
              { sum: { requests: 5 }, dimensions: { actionType: "ListObjects" } },
              { sum: { requests: 70 }, dimensions: { actionType: "GetObject" } },
              { sum: { requests: 99 }, dimensions: { actionType: "DeleteObject" } },
            ],
          };
        }
        if (query.includes("queueMessageOperationsAdaptiveGroups")) {
          return new Error("unknown field 'billableOperations'");
        }
        return { rows: [] };
      },
    });

    const report = await collectUsage("tok", account, {
      fetch: f,
      now: new Date("2026-10-08T12:00:00Z"),
    });
    const metric = (id: string) =>
      report.products.flatMap((p) => p.metrics).find((m) => m.id === id);

    expect(report.account).toEqual(account);
    expect(report.token.expiresOn).toBe("2026-10-09T00:00:00Z");
    expect(report.window).toEqual({ day: "2026-10-08", monthStart: "2026-10-01" });

    expect(metric("workers.requests")?.used).toBe(61_840);
    expect(metric("kv.reads")?.used).toBe(8_412);
    expect(metric("kv.writes")?.used).toBe(940);
    expect(metric("kv.deletes")?.used).toBe(0);
    expect(metric("kv.storage")?.used).toBe(200);
    expect(metric("r2.classA")?.used).toBe(15);
    expect(metric("r2.classB")?.used).toBe(70);

    const queues = metric("queues.operations");
    expect(queues?.used).toBeNull();
    expect(queues?.error).toMatch(/billableOperations/);

    // Every spec'd metric is present, in spec order.
    expect(report.products.map((p) => p.metrics.map((m) => m.id))).toEqual(
      FREE_PLAN.map((p) => p.metrics.map((m) => m.id)),
    );
    // Datasets go out as separate requests so one failure cannot take the others down.
    expect(calls.filter((u) => u.endsWith("/graphql")).length).toBeGreaterThan(10);
  });

  it("still returns a report when the token cannot be verified", async () => {
    const { f } = fakeCloudflare({ graphql: () => ({ rows: [] }) });
    const broken = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/user/tokens/verify"))
        return new Response("nope", { status: 403 });
      return f(input, init);
    }) as typeof fetch;
    const report = await collectUsage("tok", account, { fetch: broken });
    expect(report.token.expiresOn).toBeNull();
    expect(report.products.length).toBe(FREE_PLAN.length);
  });
});
