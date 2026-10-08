/**
 * One entry per GraphQL dataset the report needs. Each runs as its own request, so a dataset the
 * token cannot read, or a field Cloudflare renames, only blanks out its own metrics.
 *
 * Dataset and field names come from the per-product "Metrics and analytics" pages on
 * developers.cloudflare.com and were confirmed against a live account in October 2026.
 */
import { activeTimeToGbSeconds, r2Class, sumActions, sumLatestPerKey, total } from "./aggregate";
import { type Fetch, graphql, type TimeWindow } from "./api";

export interface CollectorContext {
  token: string;
  accountTag: string;
  window: TimeWindow;
  fetch: Fetch;
}

export interface Collector {
  metricIds: string[];
  run(ctx: CollectorContext): Promise<Record<string, number>>;
}

/** Which slice of time a dataset is filtered to, and with which filter fields. */
type Range =
  | "today" // date_geq/date_leq = today
  | "lastTwoDays" // date range yesterday..today, for storage snapshots that lag
  | "todayTime" // datetime range from 00:00 UTC to now
  | "monthTime" // datetime range from the 1st to now
  | "lastDayTime"; // datetime range from yesterday 00:00 UTC to now

interface Dataset {
  node: string;
  range: Range;
  /** Selection set inside the node, e.g. "sum { requests } dimensions { actionType }". */
  select: string;
  limit: number;
}

/** One GraphQL row. Datasets return either `sum` or `max`; both are typed so reducers can pick. */
type Row<S = Record<string, never>, D = Record<string, never>> = { sum: S; max: S; dimensions: D };

function define<Row>(spec: {
  metricIds: string[];
  dataset: Dataset;
  reduce(rows: Row[]): Record<string, number>;
}): Collector {
  return {
    metricIds: spec.metricIds,
    async run(ctx) {
      const data = await graphql<{ rows: Row[] }>(
        ctx.token,
        buildQuery(spec.dataset),
        buildVariables(spec.dataset.range, ctx),
        ctx.fetch,
      );
      return spec.reduce(data.rows);
    },
  };
}

function buildQuery({ node, range, select, limit }: Dataset): string {
  const byDate = range === "today" || range === "lastTwoDays";
  const type = byDate ? "Date" : "Time";
  const field = byDate ? "date" : "datetime";
  return `query ($accountTag: string!, $start: ${type}!, $end: ${type}!) {
    viewer { accounts(filter: { accountTag: $accountTag }) {
      rows: ${node}(limit: ${limit}, filter: { ${field}_geq: $start, ${field}_leq: $end }) { ${select} }
    } }
  }`;
}

function buildVariables(range: Range, { accountTag, window: w }: CollectorContext) {
  const bounds: Record<Range, [string, string]> = {
    today: [w.day, w.day],
    lastTwoDays: [w.yesterday, w.day],
    todayTime: [w.dayStart, w.now],
    monthTime: [w.monthStartTime, w.now],
    lastDayTime: [w.yesterdayStart, w.now],
  };
  const [start, end] = bounds[range];
  return { accountTag, start, end };
}

export const collectors: Collector[] = [
  define<Row<{ requests: number }>>({
    metricIds: ["workers.requests"],
    dataset: {
      node: "workersInvocationsAdaptive",
      range: "todayTime",
      select: "sum { requests }",
      limit: 10,
    },
    reduce: (rows) => ({ "workers.requests": total(rows, (r) => r.sum.requests) }),
  }),

  define<Row<{ requests: number }, { actionType: string }>>({
    metricIds: ["kv.reads", "kv.writes", "kv.deletes", "kv.lists"],
    dataset: {
      node: "kvOperationsAdaptiveGroups",
      range: "today",
      select: "sum { requests } dimensions { actionType }",
      limit: 100,
    },
    reduce(rows) {
      const by = (type: string) => sumActions(rows, [type], (r) => r.sum.requests);
      return {
        "kv.reads": by("read"),
        "kv.writes": by("write"),
        "kv.deletes": by("delete"),
        "kv.lists": by("list"),
      };
    },
  }),

  define<Row<{ byteCount: number }, { namespaceId: string; date: string }>>({
    metricIds: ["kv.storage"],
    dataset: {
      node: "kvStorageAdaptiveGroups",
      range: "lastTwoDays",
      select: "max { byteCount } dimensions { namespaceId date }",
      limit: 1000,
    },
    reduce: (rows) => ({
      "kv.storage": sumLatestPerKey(
        rows,
        (r) => r.dimensions.namespaceId,
        (r) => r.dimensions.date,
        (r) => r.max.byteCount,
      ),
    }),
  }),

  define<Row<{ requests: number }, { actionType: string }>>({
    metricIds: ["r2.classA", "r2.classB"],
    dataset: {
      node: "r2OperationsAdaptiveGroups",
      range: "monthTime",
      select: "sum { requests } dimensions { actionType }",
      limit: 100,
    },
    reduce: (rows) => ({
      "r2.classA": total(
        rows.filter((r) => r2Class(r.dimensions.actionType) === "A"),
        (r) => r.sum.requests,
      ),
      "r2.classB": total(
        rows.filter((r) => r2Class(r.dimensions.actionType) === "B"),
        (r) => r.sum.requests,
      ),
    }),
  }),

  define<
    Row<{ payloadSize: number; metadataSize: number }, { bucketName: string; datetime: string }>
  >({
    metricIds: ["r2.storage"],
    dataset: {
      node: "r2StorageAdaptiveGroups",
      range: "lastDayTime",
      select: "max { payloadSize metadataSize } dimensions { bucketName datetime }",
      limit: 1000,
    },
    reduce: (rows) => ({
      "r2.storage": sumLatestPerKey(
        rows,
        (r) => r.dimensions.bucketName,
        (r) => r.dimensions.datetime,
        (r) => r.max.payloadSize + r.max.metadataSize,
      ),
    }),
  }),

  define<Row<{ rowsRead: number; rowsWritten: number }>>({
    metricIds: ["d1.rowsRead", "d1.rowsWritten"],
    dataset: {
      node: "d1AnalyticsAdaptiveGroups",
      range: "today",
      select: "sum { rowsRead rowsWritten }",
      limit: 10,
    },
    reduce: (rows) => ({
      "d1.rowsRead": total(rows, (r) => r.sum.rowsRead),
      "d1.rowsWritten": total(rows, (r) => r.sum.rowsWritten),
    }),
  }),

  define<Row<{ databaseSizeBytes: number }, { databaseId: string; date: string }>>({
    metricIds: ["d1.storage"],
    dataset: {
      node: "d1StorageAdaptiveGroups",
      range: "lastTwoDays",
      select: "max { databaseSizeBytes } dimensions { databaseId date }",
      limit: 1000,
    },
    reduce: (rows) => ({
      "d1.storage": sumLatestPerKey(
        rows,
        (r) => r.dimensions.databaseId,
        (r) => r.dimensions.date,
        (r) => r.max.databaseSizeBytes,
      ),
    }),
  }),

  define<Row<{ requests: number }>>({
    metricIds: ["do.requests"],
    dataset: {
      node: "durableObjectsInvocationsAdaptiveGroups",
      range: "today",
      select: "sum { requests }",
      limit: 10,
    },
    reduce: (rows) => ({ "do.requests": total(rows, (r) => r.sum.requests) }),
  }),

  define<Row<{ activeTime: number }>>({
    metricIds: ["do.duration"],
    dataset: {
      node: "durableObjectsPeriodicGroups",
      range: "today",
      select: "sum { activeTime }",
      limit: 10,
    },
    reduce: (rows) => ({
      "do.duration": activeTimeToGbSeconds(total(rows, (r) => r.sum.activeTime)),
    }),
  }),

  define<Row<{ rowsRead: number; rowsWritten: number }>>({
    metricIds: ["do.rowsRead", "do.rowsWritten"],
    dataset: {
      node: "durableObjectsPeriodicGroups",
      range: "today",
      select: "sum { rowsRead rowsWritten }",
      limit: 10,
    },
    reduce: (rows) => ({
      "do.rowsRead": total(rows, (r) => r.sum.rowsRead),
      "do.rowsWritten": total(rows, (r) => r.sum.rowsWritten),
    }),
  }),

  define<Row<{ billableOperations: number }>>({
    metricIds: ["queues.operations"],
    dataset: {
      node: "queueMessageOperationsAdaptiveGroups",
      range: "today",
      select: "sum { billableOperations }",
      limit: 10,
    },
    reduce: (rows) => ({ "queues.operations": total(rows, (r) => r.sum.billableOperations) }),
  }),

  define<Row<{ totalNeurons: number }>>({
    metricIds: ["ai.neurons"],
    dataset: {
      node: "aiInferenceAdaptiveGroups",
      range: "today",
      select: "sum { totalNeurons }",
      limit: 10,
    },
    reduce: (rows) => ({ "ai.neurons": total(rows, (r) => r.sum.totalNeurons) }),
  }),
];
