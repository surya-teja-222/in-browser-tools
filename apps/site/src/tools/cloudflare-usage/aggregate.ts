/** Pure helpers that turn GraphQL rows into one number. Unit tested in isolation. */

/** Adds up `value` over every row. */
export function total<T>(rows: T[], value: (row: T) => number): number {
  let n = 0;
  for (const row of rows) n += value(row);
  return n;
}

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
  return total([...latest.values()], value);
}

/** Sums `value` over rows whose `actionType` dimension is in `types`. */
export function sumActions<T extends { dimensions: { actionType: string } }>(
  rows: T[],
  types: readonly string[],
  value: (row: T) => number,
): number {
  return total(
    rows.filter((r) => types.includes(r.dimensions.actionType)),
    value,
  );
}

/** R2 operation classes, from the R2 pricing page. */
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
