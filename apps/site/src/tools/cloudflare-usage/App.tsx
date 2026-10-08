import { XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/ui/Button";
import { ErrorLine, Panel } from "./bits";
import { LedgerSkeleton, Report } from "./Report";
import { SAMPLE_REPORT } from "./sample";
import { TokenForm } from "./TokenForm";
import type { AccountSummary, UsageReport, UsageResponse } from "./types";

const ENDPOINT = "/api/cloudflare-usage/";

type View =
  | { kind: "form" }
  | { kind: "choose"; accounts: AccountSummary[] }
  | { kind: "report"; report: UsageReport; sample: boolean };

export default function App() {
  // The token lives in component state only. Reloading the page or pressing "Start over"
  // forgets it; nothing is written to storage.
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [view, setView] = useState<View>({ kind: "form" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(nextAccountId = accountId) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${token.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: nextAccountId.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as UsageResponse | null;
      if (!data) {
        setError(`The server answered ${res.status} without a readable body. Try again.`);
      } else if (data.kind === "error") {
        setError(data.error);
      } else if (data.kind === "choose-account") {
        setView({ kind: "choose", accounts: data.accounts });
      } else {
        setView({ kind: "report", report: data.report, sample: false });
      }
    } catch {
      setError("Could not reach this site's server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setToken("");
    setAccountId("");
    setError(null);
    setView({ kind: "form" });
  }

  if (view.kind === "report") {
    return (
      <Report
        report={view.report}
        sample={view.sample}
        busy={busy}
        error={error}
        onRefresh={view.sample ? undefined : () => check(view.report.account.id)}
        onReset={reset}
      />
    );
  }

  if (view.kind === "choose") {
    return (
      <Panel>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Which account?</h2>
        <p className="mt-2 text-ink-muted">This token can see more than one account.</p>
        <ul className="mt-6 flex flex-col gap-2">
          {view.accounts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setAccountId(a.id);
                  check(a.id);
                }}
                className="flex w-full flex-col items-start gap-0.5 rounded-control border border-rule bg-paper px-4 py-3 text-left transition-colors hover:border-ink-muted disabled:opacity-50"
              >
                <span className="font-medium">{a.name}</span>
                <span className="font-mono text-xs text-ink-muted">{a.id}</span>
              </button>
            </li>
          ))}
        </ul>
        {error && <ErrorLine>{error}</ErrorLine>}
        <div className="mt-6">
          <Button variant="ghost" onClick={reset}>
            <XIcon /> Start over
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <TokenForm
        token={token}
        accountId={accountId}
        busy={busy}
        error={error}
        onToken={setToken}
        onAccountId={setAccountId}
        onSubmit={() => check()}
        onSample={() => setView({ kind: "report", report: SAMPLE_REPORT, sample: true })}
      />
      {busy && <LedgerSkeleton />}
    </div>
  );
}
