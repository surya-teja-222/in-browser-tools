import type { ToolMeta } from "../types";

export default {
  slug: "cloudflare-usage",
  name: "Cloudflare usage",
  description:
    "See how much of the Cloudflare free plan you have used today across Workers, KV, R2, D1 and more.",
  tags: [
    "cloudflare",
    "workers",
    "kv",
    "r2",
    "d1",
    "durable objects",
    "queues",
    "free plan",
    "usage",
    "quota",
  ],
  icon: "cloud",
  status: "beta",
  added: "2026-10-08",
  // Talks to this site's own /api/cloudflare-usage/ route, which relays one request to the
  // Cloudflare API. The Cloudflare API sends no CORS headers, so the browser cannot call it.
  network: "self",
} satisfies ToolMeta;
