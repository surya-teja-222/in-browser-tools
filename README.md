# tools.itssurya.com

Small tools that run entirely in the browser. Files you open stay on your device.

## Develop

Requires Node 22.18+ and pnpm 12.

```sh
pnpm install
pnpm dev            # http://localhost:4321
```

| Command | What it does |
|---|---|
| `pnpm new-tool <slug> "Name"` | Scaffold a new tool |
| `pnpm build` | Production build into `apps/site/dist` |
| `pnpm preview` | Serve the production build |
| `pnpm lint` / `pnpm format` | Biome for TS/CSS/JSON, Prettier for `.astro` |
| `pnpm typecheck` | `astro check` |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Smoke tests against the production build (Playwright) |
| `pnpm sync` | Regenerate `vercel.json` from the tool registry |

## Adding a tool

```sh
pnpm new-tool csv-viewer "CSV viewer"
```

This creates:

```
apps/site/src/tools/csv-viewer/
  meta.ts      registry entry: name, description, tags, icon, network policy
  App.tsx      the tool (plain React, loaded only on its own page)
  docs.md      "How it works" text shown under the tool
apps/site/src/pages/csv-viewer/index.astro   six-line page that mounts App
```

The index page, sitemap and smoke tests pick the tool up automatically. Set `status: "live"`
in `meta.ts` when it is ready.

Rules:

- **Tools are self-contained.** A tool never imports from another tool's folder. Shared code goes
  in `src/ui` (components) or `src/lib` (logic). A test enforces this.
- **Network access is declared.** `network: "none"` (the default) makes the browser block every
  request from the page. Use `"self"` or a list of origins only when the tool needs them.
- **Heavy tools stay lazy.** Large libraries and WASM load with dynamic `import()` inside the tool,
  or inside a Web Worker, never at the top of a shared module.
- **Threaded WASM** (SharedArrayBuffer) needs `crossOriginIsolated: true` in `meta.ts`, then
  `pnpm sync`. Hosts cap single files at about 25 MB, so load big `.wasm` files from a CDN that
  sends CORP headers.

## How it fits together

- **Astro 7** builds one static HTML page per tool. Each tool's React UI is an island
  (`client:only="react"`), so its code loads only on that page.
- **Security headers.** The Content-Security-Policy is a `<meta>` tag written by Astro per page
  (see `src/layouts/Base.astro`), so it works on any host. Headers that cannot be a `<meta>` tag
  (frame blocking, COOP/COEP, caching) are generated from the registry into `vercel.json` by
  `apps/site/scripts/sync.ts`. The build fails if `vercel.json` is out of date.
- **Styling.** Tailwind v4 with design tokens in `src/styles/global.css`. Components follow
  shadcn/ui conventions (`components.json`), so `pnpm dlx shadcn@latest add <component>` works
  from `apps/site`.

## Deploy

Vercel (Hobby), connected to this repo. Production deploys from `main`, and every PR gets a
preview URL. Project settings come from `vercel.json`; leave the Vercel root directory at the repo
root. DNS: a `CNAME` record `tools` pointing to `cname.vercel-dns.com`, set to DNS only (not
proxied) in Cloudflare.

Moving to Cloudflare Workers later: add a `_headers` writer next to `vercelConfig` in
`scripts/host-config.ts`, add a `wrangler.jsonc` that serves `apps/site/dist`, and change the DNS
record. Nothing in the tools themselves depends on the host.
