/**
 * Registry entry for a tool. Every tool folder has a `meta.ts` that default-exports one of these.
 *
 * meta.ts must stay pure data (type-only imports, no runtime imports) so it can be read both by
 * Astro pages and by plain Node scripts (scripts/sync.ts) without a bundler.
 */
export interface ToolMeta {
  /** URL segment and folder name. Lowercase, hyphenated. */
  slug: string;
  /** Display name, sentence case. */
  name: string;
  /** One sentence, shown on the index and in search results and link previews. */
  description: string;
  /** Lowercase keywords used by the index filter. */
  tags: string[];
  /** Phosphor icon name in kebab case, e.g. "brackets-curly". See https://phosphoricons.com */
  icon: string;
  /** "planned" tools are listed on the index but have no page yet. */
  status: "live" | "beta" | "planned";
  /** ISO date the tool was added. Used for ordering. */
  added: string;
  /**
   * What the tool may talk to over the network. Becomes the page's CSP `connect-src`.
   * "none" means the tool works entirely offline once loaded, and the browser enforces it.
   */
  network: "none" | "self" | string[];
  /**
   * Serve the page with COOP/COEP so SharedArrayBuffer and threaded WASM work.
   * Every subresource then needs CORP/CORS headers, so only turn this on when needed.
   */
  crossOriginIsolated?: boolean;
}
