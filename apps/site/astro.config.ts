import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Static output only, no host adapter. dist/ is plain files that any static
// host can serve. Host-specific headers live in the generated vercel.json
// (see scripts/sync.ts).
export default defineConfig({
  site: "https://tools.itssurya.com",
  output: "static",
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
  },
});
