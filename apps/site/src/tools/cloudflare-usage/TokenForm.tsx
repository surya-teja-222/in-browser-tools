import { ArrowSquareOutIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { type SyntheticEvent, useId } from "react";
import { Button } from "@/ui/Button";
import { ErrorLine, Panel } from "./bits";

/** Opens the Cloudflare token form with the one permission this tool needs already ticked. */
const CREATE_TOKEN_URL = `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encodeURIComponent(
  JSON.stringify([{ key: "account_analytics", type: "read" }]),
)}&accountId=*&zoneId=all&name=${encodeURIComponent("Usage check (tools.itssurya.com)")}`;

export function TokenForm(props: {
  token: string;
  accountId: string;
  busy: boolean;
  error: string | null;
  onToken: (v: string) => void;
  onAccountId: (v: string) => void;
  onSubmit: () => void;
  onSample: () => void;
}) {
  const tokenId = useId();
  const accountIdId = useId();

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (props.token.trim()) props.onSubmit();
  }

  return (
    <Panel>
      <form onSubmit={submit} className="flex flex-col gap-6" aria-busy={props.busy}>
        <div className="max-w-[56ch]">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Check your free plan usage
          </h2>
          <p className="mt-2 text-ink-muted">
            Paste an API token with{" "}
            <strong className="font-medium text-ink">Account Analytics: Read</strong>. Give it a
            short expiry, since it is only needed for this one check.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={tokenId} className="text-sm font-medium">
              API token
            </label>
            <input
              id={tokenId}
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
              value={props.token}
              onChange={(e) => props.onToken(e.target.value)}
              placeholder="Paste the token Cloudflare shows once"
              className="h-9 rounded-control border border-rule bg-paper px-3 font-mono text-sm placeholder:font-sans placeholder:text-ink-muted"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={accountIdId} className="text-sm font-medium">
              Account ID <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input
              id={accountIdId}
              type="text"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              pattern="[0-9a-fA-F]{32}"
              title="32 hex characters"
              value={props.accountId}
              onChange={(e) => props.onAccountId(e.target.value)}
              placeholder="Only if the token cannot list accounts"
              className="h-9 rounded-control border border-rule bg-paper px-3 font-mono text-sm placeholder:font-sans placeholder:text-ink-muted"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={props.busy || !props.token.trim()}>
            <ShieldCheckIcon />
            {props.busy ? "Checking" : "Check usage"}
          </Button>
          <Button onClick={() => window.open(CREATE_TOKEN_URL, "_blank", "noopener,noreferrer")}>
            Create a token <ArrowSquareOutIcon />
          </Button>
          <Button variant="ghost" onClick={props.onSample} disabled={props.busy}>
            Try a sample
          </Button>
        </div>

        {props.error && <ErrorLine>{props.error}</ErrorLine>}

        <p className="flex max-w-[60ch] gap-2 text-sm text-ink-muted">
          <ShieldCheckIcon className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
          <span>
            Unlike the other tools here, this one uses a server. Cloudflare's API refuses calls from
            browsers, so your token goes to this site's server for this one check, is used to ask
            Cloudflare for the numbers, and is then dropped. It is never stored or logged, and this
            page forgets it when you reload.
          </span>
        </p>
      </form>
    </Panel>
  );
}
