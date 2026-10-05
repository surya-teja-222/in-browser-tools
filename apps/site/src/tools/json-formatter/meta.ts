import type { ToolMeta } from "../types";

export default {
  slug: "json-formatter",
  name: "JSON formatter",
  description: "Format, validate and minify JSON. Errors point to the exact line and column.",
  tags: ["json", "format", "validate", "minify", "pretty print"],
  icon: "brackets-curly",
  status: "live",
  added: "2026-10-05",
  network: "none",
} satisfies ToolMeta;
