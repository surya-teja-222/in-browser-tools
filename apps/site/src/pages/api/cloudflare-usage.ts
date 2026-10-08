import type { APIRoute } from "astro";
import { CloudflareError } from "@/tools/cloudflare-usage/api";
import { collectUsage, resolveAccount } from "@/tools/cloudflare-usage/collect";
import type { UsageResponse } from "@/tools/cloudflare-usage/types";

export const prerender = false;

/**
 * Relays one usage check to the Cloudflare API with the caller's token. The token arrives in the
 * Authorization header, is used for this request, and is never logged or stored. Only the browser
 * on this site may call it; the Origin check stops the route being used as a general proxy.
 */
export const POST: APIRoute = async ({ request, site }) => {
  if (!sameSite(request, site)) return respond({ kind: "error", error: "Forbidden." }, 403);

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token || token.length > 256 || !/^[\w.-]+$/.test(token)) {
    return respond({ kind: "error", error: "Paste a Cloudflare API token first." }, 400);
  }

  const body = (await request.json().catch(() => ({}))) as { accountId?: unknown };
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : undefined;
  if (accountId && !/^[0-9a-f]{32}$/.test(accountId)) {
    return respond(
      {
        kind: "error",
        error: "An account ID is 32 hex characters, like the one in dashboard URLs.",
      },
      400,
    );
  }

  try {
    const resolved = await resolveAccount(token, accountId || undefined, fetch);
    if (resolved.kind === "choose") {
      return respond({ kind: "choose-account", accounts: resolved.accounts }, 200);
    }
    const report = await collectUsage(token, resolved.account);
    return respond({ kind: "report", report }, 200);
  } catch (e) {
    if (e instanceof CloudflareError) {
      const status = e.status === 401 || e.status === 403 ? 401 : e.status === 400 ? 400 : 502;
      return respond({ kind: "error", error: e.message }, status);
    }
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return respond(
      {
        kind: "error",
        error: timedOut ? "Cloudflare took too long to answer." : "Could not reach Cloudflare.",
      },
      502,
    );
  }
};

export const GET: APIRoute = () =>
  respond({ kind: "error", error: "Send a POST with an Authorization header." }, 405);

/**
 * True when the call comes from a page on this deployment. The canonical site origin counts, and
 * so does whatever host the request arrived on, so preview deployments on other hostnames work.
 * Requests without an Origin header (curl, tests) are allowed; there is no cookie to protect.
 */
function sameSite(request: Request, site: URL | undefined): boolean {
  const origin = request.headers.get("origin");
  if (!origin || import.meta.env.DEV) return true;
  if (site && origin === site.origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return !!host && new URL(origin).host === host.split(",")[0]?.trim();
  } catch {
    return false;
  }
}

function respond(body: UsageResponse, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
