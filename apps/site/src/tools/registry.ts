import type { ToolMeta } from "./types";

const modules = import.meta.glob<{ default: ToolMeta }>("./*/meta.ts", { eager: true });

/** All tools, newest first. Live and beta tools come before planned ones. */
export const tools: ToolMeta[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => {
    const planned = Number(a.status === "planned") - Number(b.status === "planned");
    return planned || b.added.localeCompare(a.added);
  });

export function getTool(slug: string): ToolMeta {
  const tool = tools.find((t) => t.slug === slug);
  if (!tool) throw new Error(`No tool registered with slug "${slug}"`);
  return tool;
}
