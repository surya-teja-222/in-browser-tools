import {
  ArrowDownIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/cn";
import { useFocusMode } from "@/lib/useFocusMode";
import { Button } from "@/ui/Button";
import { FileDrop } from "@/ui/FileDrop";
import { toMarkdown } from "./markdown";
import { parseExport, type Transcript } from "./parse";
import { SAMPLE_EXPORT, SAMPLE_FILE_NAME } from "./sample";
import { TurnView } from "./Transcript";

const MAX_BYTES = 50 * 1024 * 1024;

interface Loaded {
  transcript: Transcript;
  fileName: string | null;
}

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((text: string, fileName: string | null) => {
    const transcript = parseExport(text, fileName ?? undefined);
    if (transcript.turns.length === 0 || transcript.stats.prompts + transcript.stats.replies < 2) {
      setError(
        `${fileName ?? "That text"} doesn't look like a Claude Code export. Exports mark your messages with ❯ and Claude's with ⏺.`,
      );
      return;
    }
    setError(null);
    setLoaded({ transcript, fileName });
    window.scrollTo({ top: 0 });
  }, []);

  async function openFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError(`${file.name} is larger than 50 MB. Exports that big are not supported yet.`);
      return;
    }
    load(await file.text(), file.name);
  }

  // Pasting anywhere on the page loads the pasted export, while nothing is open.
  useEffect(() => {
    if (loaded) return;
    function onPaste(e: ClipboardEvent) {
      const text = e.clipboardData?.getData("text/plain");
      if (text) load(text, null);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loaded, load]);

  return (
    <FileDrop accept=".txt,text/plain" onFiles={([file]) => file && openFile(file)}>
      {({ open, dragging }) =>
        loaded ? (
          <Viewer
            {...loaded}
            onOpenAnother={open}
            onClose={() => setLoaded(null)}
            dragging={dragging}
          />
        ) : (
          <div
            className={cn(
              "flex min-h-[min(60dvh,30rem)] flex-col items-start justify-center gap-6 rounded-panel border-2 border-dashed border-rule bg-surface p-8 transition-colors sm:p-12",
              dragging && "border-sun bg-sun/10",
            )}
          >
            <div className="max-w-[52ch]">
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                Open a Claude Code export
              </h2>
              <p className="mt-2 text-ink-muted">
                In Claude Code, run <code className="font-mono text-[0.9em] text-ink">/export</code>{" "}
                and save to a file. Then drop the .txt file here, or paste its text anywhere on this
                page.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={open}>
                <FolderOpenIcon /> Open file
              </Button>
              <Button onClick={() => load(SAMPLE_EXPORT, SAMPLE_FILE_NAME)}>Try a sample</Button>
            </div>
            {error && (
              <p role="alert" className="flex max-w-[60ch] gap-2 text-danger">
                <WarningCircleIcon className="mt-0.5 size-5 shrink-0" /> {error}
              </p>
            )}
          </div>
        )
      }
    </FileDrop>
  );
}

function Viewer({
  transcript,
  fileName,
  onOpenAnother,
  onClose,
  dragging,
}: Loaded & { onOpenAnother: () => void; onClose: () => void; dragging: boolean }) {
  useFocusMode(true);
  const [rawQuery, setRawQuery] = useState("");
  const query = useDeferredValue(rawQuery.trim().toLowerCase());
  const [expandAll, setExpandAll] = useState(false);
  const [hits, setHits] = useState<HTMLElement[]>([]);
  const [current, setCurrent] = useState(0);
  const [copied, setCopied] = useState(false);
  const article = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const promptNumbers = useMemo(() => {
    let n = 0;
    return transcript.turns.map((turn) => (turn.role === "user" ? ++n : 0));
  }, [transcript]);

  // Collect search hits and jump to the first one. Waits two frames so tool rows that open
  // themselves because they contain a match have rendered their output.
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const marks = query
          ? [...(article.current?.querySelectorAll<HTMLElement>("mark[data-hit]") ?? [])]
          : [];
        setHits(marks);
        setCurrent(0);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [query, expandAll]);

  useEffect(() => {
    for (const [i, mark] of hits.entries()) mark.toggleAttribute("data-current", i === current);
    hits[current]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [hits, current]);

  // "/" focuses search, like the tools index.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        search.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const step = (delta: number) =>
    hits.length && setCurrent((c) => (c + delta + hits.length) % hits.length);

  async function copyMarkdown() {
    await navigator.clipboard.writeText(toMarkdown(transcript));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadMarkdown() {
    const url = URL.createObjectURL(new Blob([toMarkdown(transcript)], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(fileName ?? "claude-conversation.txt").replace(/\.txt$/i, "")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { stats, exportedAt } = transcript;
  const summary = [
    exportedAt &&
      `${exportedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${exportedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`,
    `${plural(stats.prompts, "prompt")}, ${plural(stats.replies, "reply", "replies")}, ${plural(stats.toolCalls, "tool call")}.`,
    transcript.cwd,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("transition-shadow", dragging && "ring-2 ring-sun ring-inset")}>
      <div className="sticky top-0 z-10 -mx-5 border-b border-rule bg-paper/95 px-5 backdrop-blur-sm sm:-mx-8 sm:px-8">
        <div className="mx-auto flex max-w-[72rem] flex-wrap items-center gap-x-4 gap-y-2 py-3">
          <div className="min-w-0 flex-1 basis-56">
            <h2
              className="truncate font-display text-lg font-semibold tracking-tight"
              title={transcript.title}
            >
              {transcript.title}
            </h2>
            <p className="truncate text-sm text-ink-muted" title={summary}>
              {summary}
            </p>
          </div>

          <div className="order-last flex h-9 w-full min-w-0 items-center gap-1 rounded-control border border-rule bg-surface pr-1 focus-within:border-sun sm:order-none sm:w-72">
            <label htmlFor="transcript-search" className="sr-only">
              Search this conversation
            </label>
            <input
              id="transcript-search"
              ref={search}
              type="search"
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  step(e.shiftKey ? -1 : 1);
                }
              }}
              placeholder="Search"
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm placeholder:text-ink-muted focus:outline-none"
            />
            {query && (
              <span className="shrink-0 px-1 text-sm text-ink-muted" aria-live="polite">
                {hits.length ? `${current + 1} of ${hits.length}` : "No matches"}
              </span>
            )}
            <IconButton label="Previous match" onClick={() => step(-1)} disabled={!hits.length}>
              <ArrowUpIcon />
            </IconButton>
            <IconButton label="Next match" onClick={() => step(1)} disabled={!hits.length}>
              <ArrowDownIcon />
            </IconButton>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              aria-pressed={expandAll}
              onClick={() => setExpandAll((v) => !v)}
              title="Expand or collapse every tool call and thinking block"
            >
              {expandAll ? <ArrowsInSimpleIcon /> : <ArrowsOutSimpleIcon />}
              <span className="max-sm:sr-only">{expandAll ? "Collapse all" : "Expand all"}</span>
            </Button>
            <Button
              variant="ghost"
              className="w-9 px-0"
              aria-label={copied ? "Copied" : "Copy as Markdown"}
              title="Copy as Markdown"
              onClick={copyMarkdown}
            >
              {copied ? <CheckCircleIcon /> : <CopyIcon />}
            </Button>
            <Button
              variant="ghost"
              className="w-9 px-0"
              aria-label="Download as Markdown"
              title="Download as Markdown"
              onClick={downloadMarkdown}
            >
              <DownloadSimpleIcon />
            </Button>
            <Button variant="primary" className="ml-1" onClick={onOpenAnother}>
              <FolderOpenIcon />
              <span>
                Open<span className="max-sm:sr-only"> another</span>
              </span>
            </Button>
            <Button
              variant="ghost"
              className="w-9 px-0"
              aria-label="Close conversation"
              title="Close conversation"
              onClick={onClose}
            >
              <XIcon />
            </Button>
          </div>
        </div>
      </div>

      <div ref={article} className="mx-auto flex max-w-[72rem] flex-col gap-2 py-6">
        {transcript.turns.map((turn, i) => (
          <TurnView
            key={i}
            turn={turn}
            index={i}
            promptNumber={promptNumbers[i] ?? 0}
            query={query}
            expandAll={expandAll}
          />
        ))}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-7 shrink-0 place-items-center rounded-[0.375rem] text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-40 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n === 0 ? "no" : n} ${n === 1 ? one : many}`;
}
