import type { APIRoute } from "astro";

export const prerender = false;

/** Proves the server side is up. Also handy as a template for other API routes. */
export const GET: APIRoute = () =>
  Response.json(
    { ok: true, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
