/**
 * Regenerates host config from the tool registry.
 *
 *   pnpm sync            write vercel.json
 *   pnpm sync --check    fail if vercel.json is out of date (runs before every build)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { headerRules, vercelConfig } from "./host-config.ts";
import { loadTools, repoRoot } from "./load-tools.ts";

const check = process.argv.includes("--check");
const rules = headerRules(await loadTools());

const outputs = [
  {
    path: join(repoRoot, "vercel.json"),
    content: `${JSON.stringify(vercelConfig(rules), null, 2)}\n`,
  },
];

let stale = false;
for (const { path, content } of outputs) {
  let current = "";
  try {
    current = readFileSync(path, "utf8");
  } catch {}
  if (current === content) continue;
  if (check) {
    console.error(`${path} is out of date. Run "pnpm sync" and commit the result.`);
    let i = 0;
    while (i < current.length && i < content.length && current[i] === content[i]) i++;
    console.error(`First diff at byte ${i}.`);
    console.error(`on disk : ${JSON.stringify(current.slice(Math.max(0, i - 20), i + 40))}`);
    console.error(`expected: ${JSON.stringify(content.slice(Math.max(0, i - 20), i + 40))}`);
    stale = true;
  } else {
    writeFileSync(path, content);
    console.log(`Wrote ${path}`);
  }
}
if (stale) process.exit(1);
