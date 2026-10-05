import {
  BrainIcon,
  CaretRightIcon,
  FileTextIcon,
  GlobeIcon,
  type Icon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlugsIcon,
  TerminalWindowIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { memo, type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { type Block, type Item, type Line, plainText, type Turn } from "./parse";

/** Search context: the lowercased query, or "" when not searching. */
interface Props {
  turn: Turn;
  index: number;
  promptNumber: number;
  query: string;
  expandAll: boolean;
}

export const TurnView = memo(function TurnView({
  turn,
  index,
  promptNumber,
  query,
  expandAll,
}: Props) {
  if (turn.role === "user" && isCommand(turn.blocks)) {
    // Slash commands (/cost, /model, ...) are not prompts; show them as one compact line.
    return (
      <section
        id={`turn-${index}`}
        data-prompt={promptNumber}
        aria-label={`Command ${plainText(turn.blocks)}`}
        className="scroll-mt-6 px-5 py-2"
      >
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="size-2 rounded-full bg-sun" aria-hidden="true" />
          You ran
          <code className="font-mono text-ink">
            <Highlight text={plainText(turn.blocks)} query={query} />
          </code>
        </p>
        {turn.output && <Output text={turn.output} query={query} />}
      </section>
    );
  }
  if (turn.role === "user") {
    return (
      <section
        id={`turn-${index}`}
        data-prompt={promptNumber}
        aria-label={`Your prompt ${promptNumber}`}
        className="scroll-mt-6 rounded-panel border border-rule bg-surface px-5 py-4 [contain-intrinsic-size:auto_8rem] [content-visibility:auto]"
      >
        <p className="mb-2 flex items-center gap-2 text-sm font-medium">
          <span className="size-2 rounded-full bg-sun" aria-hidden="true" />
          You
        </p>
        <Blocks blocks={turn.blocks} query={query} />
        {turn.output && <Output text={turn.output} query={query} />}
      </section>
    );
  }
  return (
    <section
      id={`turn-${index}`}
      aria-label="Claude"
      className="scroll-mt-6 px-5 py-4 [contain-intrinsic-size:auto_12rem] [content-visibility:auto]"
    >
      <p className="mb-2 text-sm font-medium text-ink-muted">Claude</p>
      <div className="flex flex-col gap-3">
        {turn.items.map((item, i) => (
          <ItemView key={i} item={item} query={query} expandAll={expandAll} />
        ))}
      </div>
    </section>
  );
});

function ItemView({ item, query, expandAll }: { item: Item; query: string; expandAll: boolean }) {
  switch (item.kind) {
    case "text":
      return (
        <div>
          <Blocks blocks={item.blocks} query={query} />
          {item.output && <Output text={item.output} query={query} />}
        </div>
      );
    case "tool": {
      const ToolIcon = toolIcon(item.name);
      return (
        <Disclosure
          open={expandAll}
          forceOpen={!!item.output && contains(item.output, query)}
          disabled={!item.output}
          summary={
            <>
              <ToolIcon className="size-4.5 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="shrink-0 font-mono text-[0.8125rem] font-semibold">
                <Highlight text={item.name} query={query} />
              </span>
              {item.args && (
                <span className="min-w-0 truncate font-mono text-[0.8125rem] text-ink-muted">
                  <Highlight text={item.args} query={query} />
                </span>
              )}
            </>
          }
        >
          {item.output && <Pre text={item.output} query={query} />}
        </Disclosure>
      );
    }
    case "thinking":
      return (
        <Disclosure
          open={expandAll}
          forceOpen={item.blocks.some((b) => blockContains(b, query))}
          summary={
            <>
              <BrainIcon className="size-4.5 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className="text-sm text-ink-muted">Thinking</span>
            </>
          }
        >
          <div className="text-ink-muted">
            <Blocks blocks={item.blocks} query={query} />
          </div>
        </Disclosure>
      );
    case "status":
      return (
        <div className="text-sm text-ink-muted">
          <Highlight text={item.text} query={query} />
          {item.output && <Output text={item.output} query={query} />}
        </div>
      );
  }
}

function Blocks({ blocks, query }: { blocks: Block[]; query: string }) {
  return (
    <div className="flex max-w-[72ch] flex-col gap-3 leading-relaxed">
      {blocks.map((block, i) => {
        // biome-ignore-start lint/suspicious/noArrayIndexKey: blocks never reorder
        if (block.kind === "rule") return <hr key={i} className="border-rule" />;
        if (block.kind === "code") return <Pre key={i} text={block.text} query={query} />;
        return (
          <div key={i}>
            {block.lines.map((line, j) => (
              <LineView key={j} line={line} query={query} />
            ))}
          </div>
        );
        // biome-ignore-end lint/suspicious/noArrayIndexKey: blocks never reorder
      })}
    </div>
  );
}

/** One logical line. List items get a hanging indent so wrapped text lines up under the text. */
function LineView({ line, query }: { line: Line; query: string }) {
  const style = line.indent ? { paddingLeft: `${line.indent * 0.5}em` } : undefined;
  if (!line.marker) {
    return (
      <p className="break-words" style={style}>
        <Highlight text={line.text} query={query} />
      </p>
    );
  }
  // List item: marker in its own column so wrapped text lines up under the text, not the marker.
  return (
    <p className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[0.45em] break-words" style={style}>
      <span className="text-ink-muted tabular-nums">{line.marker.trimEnd()}</span>
      <span>
        <Highlight text={line.text} query={query} />
      </span>
    </p>
  );
}

function Pre({ text, query }: { text: string; query: string }) {
  return (
    <pre className="overflow-x-auto rounded-control border border-rule bg-paper px-3 py-2 font-mono text-[0.8125rem] leading-relaxed">
      <Highlight text={text} query={query} />
    </pre>
  );
}

/** Output nested under a message (the ⎿ lines in the terminal). */
function Output({ text, query }: { text: string; query: string }) {
  return (
    <pre className="mt-2 border-l-2 border-rule pl-3 font-mono text-[0.8125rem] whitespace-pre-wrap text-ink-muted">
      <Highlight text={text} query={query} />
    </pre>
  );
}

function Disclosure({
  summary,
  children,
  open,
  forceOpen,
  disabled,
}: {
  summary: ReactNode;
  children: ReactNode;
  open: boolean;
  forceOpen: boolean;
  disabled?: boolean;
}) {
  const [isOpen, setOpen] = useState(open);
  useEffect(() => setOpen(open), [open]);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  if (disabled) {
    return <div className="flex min-w-0 items-center gap-2 py-1">{summary}</div>;
  }
  return (
    <div>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full min-w-0 items-center gap-2 rounded-control py-1 text-left hover:text-ink"
      >
        <CaretRightIcon
          className={cn(
            "size-3.5 shrink-0 text-ink-muted transition-transform duration-150",
            isOpen && "rotate-90",
          )}
          aria-hidden="true"
        />
        {summary}
      </button>
      {isOpen && <div className="mt-1 ml-5.5">{children}</div>}
    </div>
  );
}

/** Wraps case-insensitive matches of `query` (already lowercased) in <mark>. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark
        key={at}
        data-hit
        className="rounded-[0.15em] bg-sun/45 text-ink data-current:bg-sun data-current:text-on-sun"
      >
        {text.slice(at, at + query.length)}
      </mark>,
    );
    from = at + query.length;
  }
  if (from === 0) return <>{text}</>;
  parts.push(text.slice(from));
  return <>{parts}</>;
}

function isCommand(blocks: Block[]) {
  const text = plainText(blocks);
  return /^\/[\w:-]+(\s.*)?$/.test(text) && !text.includes("\n");
}

function contains(text: string, query: string) {
  return !!query && text.toLowerCase().includes(query);
}

function blockContains(block: Block, query: string) {
  if (!query || block.kind === "rule") return false;
  if (block.kind === "code") return contains(block.text, query);
  return block.lines.some((l) => contains(l.text, query));
}

function toolIcon(name: string): Icon {
  if (/^(Bash|Shell|PowerShell|BashOutput|KillShell)/.test(name)) return TerminalWindowIcon;
  if (/^(Read|View|NotebookRead)/.test(name)) return FileTextIcon;
  if (/^(Update|Write|Edit|MultiEdit|NotebookEdit)/.test(name)) return PencilSimpleIcon;
  if (/^(Search|Grep|Glob|Find|List|LS|Searched)/.test(name)) return MagnifyingGlassIcon;
  if (/^Web/.test(name)) return GlobeIcon;
  if (/MCP|mcp__/.test(name)) return PlugsIcon;
  return WrenchIcon;
}
