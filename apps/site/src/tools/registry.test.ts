import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { headerRules, vercelConfig } from "../../scripts/host-config";
import { repoRoot, siteDir, toolsDir } from "../../scripts/load-tools";
import { tools } from "./registry";

const toolDirs = readdirSync(toolsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

describe("tool registry", () => {
  it("has a meta.ts in every tool folder, with a matching slug", () => {
    expect(tools.map((t) => t.slug).sort()).toEqual(toolDirs.sort());
  });

  it.each(tools)("$slug has valid metadata", (tool) => {
    expect(tool.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(tool.added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tool.description.length).toBeLessThanOrEqual(160);
    expect(tool.description).not.toMatch(/[–—]/);
  });

  it.each(tools)("$slug has a page unless planned", (tool) => {
    const page = join(siteDir, "src", "pages", tool.slug, "index.astro");
    expect(existsSync(page)).toBe(tool.status !== "planned");
  });

  it("keeps tools self-contained (no imports from other tool folders)", () => {
    const offenders: string[] = [];
    for (const dir of toolDirs) {
      const files = readdirSync(join(toolsDir, dir), { recursive: true, encoding: "utf8" });
      for (const file of files.filter((f) => /\.(tsx?|jsx?)$/.test(f))) {
        const source = readFileSync(join(toolsDir, dir, file), "utf8");
        for (const [, spec] of source.matchAll(/from\s+["']([^"']+)["']/g)) {
          const other = toolDirs.find(
            (d) => d !== dir && spec?.match(new RegExp(`(^|/)tools/${d}(/|$)|^\\.\\./${d}(/|$)`)),
          );
          if (other) offenders.push(`${dir}/${file} imports ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("vercel.json is in sync with the registry (run `pnpm sync` if this fails)", () => {
    const expected = `${JSON.stringify(vercelConfig(headerRules(tools)), null, 2)}\n`;
    expect(readFileSync(join(repoRoot, "vercel.json"), "utf8")).toBe(expected);
  });
});
