# CLAUDE.md

Personal collection of in-browser tools at tools.itssurya.com. See README.md for commands and
structure. The rest of this file lists things that are easy to get wrong.

## Conventions

- One tool = `apps/site/src/tools/<slug>/` + `apps/site/src/pages/<slug>/index.astro`. Scaffold
  with `pnpm new-tool`; don't hand-create.
- `meta.ts` must stay pure data with `import type` only. Plain Node (type stripping, no bundler)
  imports it in `scripts/`, so runtime imports, enums or path aliases there break `pnpm sync`.
- Tools never import from other tool folders. Shared code goes in `src/ui` or `src/lib`.
- Tool UIs are React islands with `client:only="react"`. The index page and layouts ship no
  client React; icons there use `src/ui/ToolIcon.astro` (server-rendered Phosphor).
- After changing `crossOriginIsolated` or any header logic, run `pnpm sync` and commit
  `vercel.json`. The build and a unit test fail if it is stale.
- Keep everything host-neutral: no Vercel adapter, Vercel SDKs or Vercel-only services.

## CSP gotchas

- Every page has a strict CSP (`src/layouts/Base.astro`). No inline `<script>`/`<style>` outside
  what Astro hashes. No external fonts, images or scripts. Tools with `network: "none"` cannot
  `fetch` at all.
- Shiki is disabled for Markdown because it emits inline styles.
- React `style={{}}` props are fine (they're set through the DOM, not markup).

## UI

- Design tokens live in `src/styles/global.css`. Use semantic classes (`bg-surface`, `text-ink-muted`,
  `bg-sun`), never raw hex. `sun` is the only accent colour.
- Radius rule: controls `rounded-control`, panels `rounded-panel`, nothing else rounded.
- Icons: Phosphor only (`@phosphor-icons/react`, `*Icon` exports).
- No em dashes or en dashes in user-visible text. Sentence case everywhere.
- The `design-taste-frontend` skill (`.claude/skills/`) applies to the index and any
  marketing-style page. For tool UIs, use its general rules only (states, a11y, dark mode).
- Check both light and dark mode, and a 390px-wide viewport, before calling UI work done.

## Testing

- `pnpm test` (Vitest) for logic; `pnpm test:e2e` (Playwright) builds and smoke-tests every
  live tool, failing on any console error, which includes CSP violations.
- `astro preview` detaches into the background when run by an AI agent. Pass `--ignore-lock` to
  keep it in the foreground (the Playwright config already does), and stop strays with
  `pnpm --filter site exec astro preview stop`.
