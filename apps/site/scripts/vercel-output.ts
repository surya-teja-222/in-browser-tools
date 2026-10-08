/**
 * Moves the Vercel adapter's build output to where Vercel looks for it.
 *
 * The adapter writes Build Output API files to apps/site/.vercel/output, but the Vercel project
 * root is the repo root, so Vercel expects <repo>/.vercel/output. Runs after `pnpm build` on
 * Vercel only (see vercelConfig in host-config.ts).
 */
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, siteDir } from "./load-tools.ts";

const from = join(siteDir, ".vercel", "output");
const to = join(repoRoot, ".vercel", "output");

if (!existsSync(join(from, "config.json"))) {
  console.error(`${from} has no config.json. Was the build run with VERCEL=1?`);
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
mkdirSync(join(to, ".."), { recursive: true });
renameSync(from, to);
console.log(`Moved ${from} -> ${to}`);
