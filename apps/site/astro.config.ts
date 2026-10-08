import node from "@astrojs/node";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Pages are prerendered. Only routes that export `prerender = false` (the API routes under
// src/pages/api/) run on a server. Route code is plain Request/Response, so the adapter is the
// only host-specific line: Node for local builds, previews and tests, Vercel when Vercel builds.
// Host-specific headers live in the generated vercel.json (see scripts/sync.ts).
export default defineConfig({
  site: "https://tools.itssurya.com",
  output: "static",
  adapter: process.env.VERCEL ? vercel() : node({ mode: "standalone" }),
  trailingSlash: "always",
  integrations: [react(), sitemap()],
  // Per-page Content-Security-Policy as a <meta> tag with hashes for Astro's
  // inline scripts. Directives are set per page in layouts/Base.astro.
  security: { csp: true },
  // Shiki highlights with inline styles, which the CSP blocks. Re-enable with a class-based
  // highlighter if tool docs ever need highlighted code blocks.
  markdown: { syntaxHighlight: false },
  vite: {
    plugins: [tailwindcss()],
    // Pre-bundle shared client libraries when the dev server starts. If Vite discovers one
    // mid-session it re-bundles, and open pages fail with "504 Outdated Optimize Dep".
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "@phosphor-icons/react",
        "clsx",
        "tailwind-merge",
        "class-variance-authority",
      ],
    },
  },
});
