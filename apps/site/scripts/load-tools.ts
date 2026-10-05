import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolMeta } from "../src/tools/types.ts";

export const siteDir = join(import.meta.dirname, "..");
export const repoRoot = join(siteDir, "..", "..");
export const toolsDir = join(siteDir, "src", "tools");

/** Node-side equivalent of src/tools/registry.ts (which relies on Vite's import.meta.glob). */
export async function loadTools(): Promise<ToolMeta[]> {
  const tools: ToolMeta[] = [];
  for (const entry of readdirSync(toolsDir, { withFileTypes: true })) {
    const metaPath = join(toolsDir, entry.name, "meta.ts");
    if (!entry.isDirectory() || !existsSync(metaPath)) continue;
    const meta: ToolMeta = (await import(pathToFileURL(metaPath).href)).default;
    if (meta.slug !== entry.name) {
      throw new Error(
        `src/tools/${entry.name}/meta.ts has slug "${meta.slug}", expected "${entry.name}"`,
      );
    }
    tools.push(meta);
  }
  return tools.sort((a, b) => a.slug.localeCompare(b.slug));
}
