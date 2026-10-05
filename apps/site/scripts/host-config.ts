import type { ToolMeta } from "../src/tools/types.ts";

/**
 * Host-neutral description of the HTTP headers the site needs. Each host adapter below turns it
 * into that host's config format. Moving hosts means adding an adapter, not rewriting rules.
 *
 * Content-Security-Policy is NOT here: Astro writes it into each page as a <meta> tag, so it works
 * on any host. Only headers that cannot be set from a <meta> tag belong here.
 */
export interface HeaderRule {
  /** Path prefix, always starting and ending with "/". "/" matches everything. */
  prefix: string;
  headers: Record<string, string>;
}

export function headerRules(tools: ToolMeta[]): HeaderRule[] {
  const rules: HeaderRule[] = [
    {
      prefix: "/",
      headers: {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Frame-Options": "DENY",
        // frame-ancestors is ignored in <meta> CSP, so it has to be a header.
        "Content-Security-Policy": "frame-ancestors 'none'",
      },
    },
    {
      prefix: "/_astro/",
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  ];

  for (const tool of [...tools].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (tool.status === "planned" || !tool.crossOriginIsolated) continue;
    rules.push({
      prefix: `/${tool.slug}/`,
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    });
  }
  return rules;
}

/** https://vercel.com/docs/project-configuration */
export function vercelConfig(rules: HeaderRule[]) {
  return {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: null,
    installCommand: "pnpm install --frozen-lockfile",
    buildCommand: "pnpm build",
    outputDirectory: "apps/site/dist",
    trailingSlash: true,
    headers: rules.map((rule) => ({
      source: `${rule.prefix}(.*)`,
      headers: Object.entries(rule.headers).map(([key, value]) => ({ key, value })),
    })),
  };
}
