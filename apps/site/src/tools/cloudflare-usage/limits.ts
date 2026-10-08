import type { Period, Unit } from "./types";

/**
 * Workers Free plan allowances, from the pricing pages on developers.cloudflare.com as of
 * October 2026. There is no API for these, so they live here. Daily limits reset at 00:00 UTC,
 * monthly ones on the first of the month. Cloudflare counts a GB as 1,000,000,000 bytes.
 */
export const GB = 1_000_000_000;

export interface MetricSpec {
  id: string;
  label: string;
  limit: number;
  unit: Unit;
  period: Period;
  note?: string;
}

export interface ProductSpec {
  id: string;
  name: string;
  metrics: MetricSpec[];
}

export const FREE_PLAN: ProductSpec[] = [
  {
    id: "workers",
    name: "Workers",
    metrics: [
      {
        id: "workers.requests",
        label: "Requests",
        limit: 100_000,
        unit: "count",
        period: "day",
        note: "Pages Functions requests count towards this too.",
      },
    ],
  },
  {
    id: "kv",
    name: "Workers KV",
    metrics: [
      { id: "kv.reads", label: "Keys read", limit: 100_000, unit: "count", period: "day" },
      { id: "kv.writes", label: "Keys written", limit: 1_000, unit: "count", period: "day" },
      { id: "kv.deletes", label: "Keys deleted", limit: 1_000, unit: "count", period: "day" },
      { id: "kv.lists", label: "List requests", limit: 1_000, unit: "count", period: "day" },
      { id: "kv.storage", label: "Stored data", limit: 1 * GB, unit: "bytes", period: "total" },
    ],
  },
  {
    id: "r2",
    name: "R2",
    metrics: [
      {
        id: "r2.classA",
        label: "Class A operations",
        limit: 1_000_000,
        unit: "count",
        period: "month",
        note: "Writes, lists and multipart operations.",
      },
      {
        id: "r2.classB",
        label: "Class B operations",
        limit: 10_000_000,
        unit: "count",
        period: "month",
        note: "Reads and head requests.",
      },
      {
        id: "r2.storage",
        label: "Standard storage",
        limit: 10 * GB,
        unit: "bytes",
        period: "total",
        note: "The free allowance is 10 GB-month of Standard storage.",
      },
    ],
  },
  {
    id: "d1",
    name: "D1",
    metrics: [
      { id: "d1.rowsRead", label: "Rows read", limit: 5_000_000, unit: "count", period: "day" },
      { id: "d1.rowsWritten", label: "Rows written", limit: 100_000, unit: "count", period: "day" },
      { id: "d1.storage", label: "Storage", limit: 5 * GB, unit: "bytes", period: "total" },
    ],
  },
  {
    id: "do",
    name: "Durable Objects",
    metrics: [
      { id: "do.requests", label: "Requests", limit: 100_000, unit: "count", period: "day" },
      {
        id: "do.duration",
        label: "Duration",
        limit: 13_000,
        unit: "gbs",
        period: "day",
        note: "Wall-clock time while an object is active, at 128 MB per object.",
      },
      { id: "do.rowsRead", label: "Rows read", limit: 5_000_000, unit: "count", period: "day" },
      { id: "do.rowsWritten", label: "Rows written", limit: 100_000, unit: "count", period: "day" },
    ],
  },
  {
    id: "queues",
    name: "Queues",
    metrics: [
      {
        id: "queues.operations",
        label: "Operations",
        limit: 10_000,
        unit: "count",
        period: "day",
        note: "Writes, reads and deletes together.",
      },
    ],
  },
  {
    id: "ai",
    name: "Workers AI",
    metrics: [
      { id: "ai.neurons", label: "Neurons", limit: 10_000, unit: "neurons", period: "day" },
    ],
  },
];
