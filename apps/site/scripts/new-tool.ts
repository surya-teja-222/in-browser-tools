/**
 * Scaffolds a new tool.
 *
 *   pnpm new-tool <slug> ["Display name"]
 *
 * Creates src/tools/<slug>/{meta.ts,App.tsx,docs.md} and src/pages/<slug>/index.astro, then
 * regenerates host config. The index, sitemap and smoke tests pick the tool up automatically.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { siteDir, toolsDir } from "./load-tools.ts";

const [slug, nameArg] = process.argv.slice(2);
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: pnpm new-tool <slug> ["Display name"]   (slug: lowercase-with-hyphens)');
  process.exit(1);
}
const name = nameArg ?? slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const today = new Date().toISOString().slice(0, 10);

const toolDir = join(toolsDir, slug);
const pageDir = join(siteDir, "src", "pages", slug);
if (existsSync(toolDir) || existsSync(pageDir)) {
  console.error(`A tool or page named "${slug}" already exists.`);
  process.exit(1);
}

const files: Record<string, string> = {
  [join(toolDir, "meta.ts")]: `import type { ToolMeta } from "../types";

export default {
  slug: "${slug}",
  name: "${name}",
  description: "TODO: one sentence on what this tool does.",
  tags: [],
  icon: "wrench",
  status: "beta",
  added: "${today}",
  network: "none",
} satisfies ToolMeta;
`,
  [join(toolDir, "App.tsx")]: `export default function App() {
  return (
    <div className="rounded-panel border border-rule bg-surface p-8 text-ink-muted">
      ${name} goes here.
    </div>
  );
}
`,
  [join(toolDir, "docs.md")]: `## How it works

TODO: explain how to use ${name}.
`,
  [join(pageDir, "index.astro")]: `---
import Tool from "@/layouts/Tool.astro";
import App from "@/tools/${slug}/App";
import { Content as Docs } from "@/tools/${slug}/docs.md";
import ToolSkeleton from "@/ui/ToolSkeleton.astro";
---

<Tool slug="${slug}">
  <App client:only="react">
    <ToolSkeleton slot="fallback" />
  </App>
  <Docs slot="docs" />
</Tool>
`,
};

mkdirSync(toolDir, { recursive: true });
mkdirSync(pageDir, { recursive: true });
for (const [path, content] of Object.entries(files)) {
  writeFileSync(path, content);
  console.log(`Created ${relative(siteDir, path)}`);
}
execFileSync(process.execPath, [join(siteDir, "scripts", "sync.ts")], { stdio: "inherit" });
console.log(`\nNext: fill in meta.ts, then run "pnpm dev" and open http://localhost:4321/${slug}/`);
