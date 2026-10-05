import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  WarningCircleIcon,
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
import { Button } from "@/ui/Button";
import { FileDrop } from "@/ui/FileDrop";
import { toMarkdown } from "./markdown";
import { parseExport, plainText, type Transcript } from "./parse";
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
          <Viewer {...loaded} onOpenAnother={open} dragging={dragging} />
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
  dragging,
}: Loaded & { onOpenAnother: () => void; dragging: boolean }) {
  const [rawQuery, setRawQuery] = useState("");
  const query = useDeferredValue(rawQuery.trim().toLowerCase());
  const [expandAll, setExpandAll] = useState(false);
  const [hits, setHits] = useState<HTMLElement[]>([]);
  const [current, setCurrent] = useState(0);
  const [copied, setCopied] = useState(false);
  const [activePrompt, setActivePrompt] = useState(1);
  const article = useRef<HTMLDivElement>(null);

  const prompts = useMemo(() => {
    let n = 0;
    return transcript.turns.map((turn, index) =>
      turn.role === "user"
        ? { index, number: ++n, label: plainText(turn.blocks).replace(/\s+/g, " ").slice(0, 90) }
        : null,
    );
  }, [transcript]);
  const outline = prompts.filter((p) => p !== null);

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

  // Highlight the prompt currently in view in the outline.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) setActivePrompt(Number((e.target as HTMLElement).dataset.prompt));
      },
      { rootMargin: "-15% 0px -75% 0px" },
    );
    for (const el of article.current?.querySelectorAll("[data-prompt]") ?? []) observer.observe(el);
    return () => observer.disconnect();
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
      `Exported ${exportedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} at ${exportedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`,
    `${plural(stats.prompts, "prompt")}, ${plural(stats.replies, "reply", "replies")}, ${plural(stats.toolCalls, "tool call")}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cn(
        "rounded-panel transition-shadow",
        dragging && "ring-2 ring-sun ring-offset-4 ring-offset-paper",
      )}
    >
      <div className="flex flex-col gap-4 border-b border-rule pb-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 lg:flex-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {transcript.title}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {summary}
            {transcript.cwd && (
              <>
                {" "}
                In{" "}
                <code className="inline-block max-w-full truncate align-bottom font-mono text-[0.95em]">
                  {transcript.cwd}
                </code>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:shrink-0 lg:flex-nowrap">
          <Button onClick={copyMarkdown}>
            {copied ? <CheckCircleIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy as Markdown"}
          </Button>
          <Button onClick={downloadMarkdown}>
            <DownloadSimpleIcon /> Download .md
          </Button>
          <Button variant="primary" onClick={onOpenAnother}>
            <FolderOpenIcon /> Open another
          </Button>
        </div>
      </div>

      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-x-5 gap-y-2 bg-paper/95 px-1 py-3 backdrop-blur-sm">
        <div className="flex h-9 w-full min-w-0 items-center gap-1 rounded-control border border-rule bg-surface pr-1 focus-within:border-sun sm:w-auto sm:max-w-md sm:flex-1">
          <label htmlFor="transcript-search" className="sr-only">
            Search this conversation
          </label>
          <input
            id="transcript-search"
            type="search"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                step(e.shiftKey ? -1 : 1);
              }
            }}
            placeholder="Search this conversation"
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={expandAll}
            onChange={(e) => setExpandAll(e.target.checked)}
            className="size-4 accent-[var(--color-sun)]"
          />
          Expand tool output and thinking
        </label>
      </div>

      <div className="mt-4 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Your prompts" className="hidden lg:block">
          <div className="sticky top-16 max-h-[calc(100dvh-5rem)] overflow-y-auto pr-2">
            <p className="mb-2 text-sm font-medium">Your prompts</p>
            <ol className="flex flex-col gap-0.5 text-sm">
              {outline.map((p) => (
                <li key={p.index}>
                  <a
                    href={`#turn-${p.index}`}
                    aria-current={p.number === activePrompt ? "true" : undefined}
                    className="grid grid-cols-[1.75rem_1fr] rounded-control px-2 py-1.5 text-ink-muted hover:bg-surface hover:text-ink aria-[current]:bg-surface aria-[current]:text-ink"
                  >
                    <span className="tabular-nums">{p.number}</span>
                    <span className="line-clamp-2">{p.label || "(empty prompt)"}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div ref={article} className="flex min-w-0 flex-col gap-2">
          {transcript.turns.map((turn, i) => (
            <TurnView
              key={i}
              turn={turn}
              index={i}
              promptNumber={prompts[i]?.number ?? 0}
              query={query}
              expandAll={expandAll}
            />
          ))}
        </div>
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
