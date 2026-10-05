/**
 * Parser for Claude Code `/export` text files.
 *
 * The export is a static render of the terminal UI, so the file is what the terminal showed:
 *
 *   ❯ user message                      (older versions: "> ")
 *   ⏺ assistant text, tool call or notice, e.g. "⏺ Bash(ls -la)"
 *     ⎿  output nested under the line above (continuation lines indented 5)
 *   ✻ Thinking… / status lines          (also ∴ ✢ ✳ ✶ ※ ✽)
 *
 * Continuation lines are indented 2 spaces, Markdown is already rendered (no code fences) and
 * text is hard-wrapped at the terminal width. `unwrap` undoes the wrapping.
 */

export interface Line {
  /** Leading spaces, relative to the message's left edge. */
  indent: number;
  /** List marker including its trailing space, e.g. "1. " or "- ". Empty if not a list item. */
  marker: string;
  text: string;
}

export type Block =
  | { kind: "prose"; lines: Line[] }
  | { kind: "code"; text: string }
  | { kind: "rule" };

export type Item =
  | { kind: "text"; blocks: Block[]; output?: string }
  | { kind: "tool"; name: string; args: string; output?: string }
  | { kind: "thinking"; blocks: Block[] }
  | { kind: "status"; text: string; output?: string };

export type Turn =
  | { role: "user"; blocks: Block[]; output?: string }
  | { role: "assistant"; items: Item[] };

export interface Transcript {
  title: string;
  exportedAt?: Date;
  version?: string;
  cwd?: string;
  turns: Turn[];
  stats: { prompts: number; replies: number; toolCalls: number };
}

const USER = ["❯ ", "> "];
const ASSISTANT = ["⏺ ", "● "];
const STATUS = ["✻ ", "∴ ", "✢ ", "✳ ", "✶ ", "※ ", "✽ "];
const OUTPUT = /^ {0,6}⎿ ?/;

/** Terminal column width of a string (wide CJK and emoji count as 2). */
export function displayWidth(s: string): number {
  let width = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x20 || (cp >= 0x300 && cp < 0x370) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f))
      continue;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f64f) ||
      (cp >= 0x1f900 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd);
    width += wide ? 2 : 1;
  }
  return width;
}

/** A physical line of a message: text with the 2-column prefix removed, plus its original width. */
interface Raw {
  text: string;
  width: number;
}

type RawBlock =
  | { type: "user" | "assistant" | "status"; lines: Raw[]; output: string[] }
  | { type: "loose"; lines: Raw[]; output: string[] };

export function parseExport(input: string, fileName?: string): Transcript {
  let lines = input
    .replace(/\r\n?/g, "\n")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI colour codes if present
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.trimEnd());

  const banner = readBanner(lines);
  lines = lines.slice(banner.length);

  // Wrap width: the widest line, but never less than 80 so short files aren't over-joined.
  const wrapWidth = Math.max(80, ...lines.map(displayWidth));

  const blocks: RawBlock[] = [];
  let current: RawBlock | null = null;
  let inOutput = false;

  for (const line of lines) {
    const start = matchStart(line);
    if (start) {
      current = {
        type: start.type,
        lines: [{ text: line.slice(start.prefix.length), width: displayWidth(line) }],
        output: [],
      };
      blocks.push(current);
      inOutput = false;
      continue;
    }
    const out = OUTPUT.exec(line);
    if (out) {
      if (!current) {
        current = { type: "loose", lines: [], output: [] };
        blocks.push(current);
      }
      current.output.push(line.slice(out[0].length).replace(/^ {1,2}/, ""));
      inOutput = true;
      continue;
    }
    if (!current) {
      if (line === "") continue;
      current = { type: "loose", lines: [], output: [] };
      blocks.push(current);
    }
    const indent = line.length - line.trimStart().length;
    if (inOutput && (line === "" || indent >= 4)) {
      current.output.push(line === "" ? "" : line.slice(Math.min(indent, 5)));
      continue;
    }
    inOutput = false;
    current.lines.push({ text: line.slice(Math.min(indent, 2)), width: displayWidth(line) });
  }

  const turns: Turn[] = [];
  for (const raw of blocks) {
    const output = trimBlankEdges(raw.output).join("\n") || undefined;
    if (raw.type === "user") {
      turns.push({
        role: "user",
        blocks: toBlocks(raw.lines, wrapWidth),
        ...(output && { output }),
      });
      continue;
    }
    const item = toItem(raw, wrapWidth, output);
    if (!item) continue;
    const last = turns.at(-1);
    if (last?.role === "assistant") last.items.push(item);
    else turns.push({ role: "assistant", items: [item] });
  }

  const name = parseFileName(fileName);
  const firstPrompt = turns.find((t) => t.role === "user");
  // Without a title in the file name, use the first line of the first prompt.
  const firstLine =
    firstPrompt?.role === "user" ? (plainText(firstPrompt.blocks).split("\n")[0] ?? "") : "";
  const title = name.title ?? truncate(firstLine.trim(), 80);

  return {
    title: title || "Claude Code conversation",
    ...(name.exportedAt && { exportedAt: name.exportedAt }),
    ...(banner.version && { version: banner.version }),
    ...(banner.cwd && { cwd: banner.cwd }),
    turns,
    stats: {
      prompts: turns.filter((t) => t.role === "user").length,
      replies: turns.filter((t) => t.role === "assistant").length,
      toolCalls: turns.reduce(
        (n, t) =>
          n + (t.role === "assistant" ? t.items.filter((i) => i.kind === "tool").length : 0),
        0,
      ),
    },
  };
}

function matchStart(
  line: string,
): { type: "user" | "assistant" | "status"; prefix: string } | null {
  for (const prefix of USER)
    if (line.startsWith(prefix) || line === prefix.trim()) return { type: "user", prefix };
  for (const prefix of ASSISTANT) if (line.startsWith(prefix)) return { type: "assistant", prefix };
  for (const prefix of STATUS) if (line.startsWith(prefix)) return { type: "status", prefix };
  return null;
}

/** The welcome box ("╭── Claude Code v2.x ──╮ … ╰──╯") some exports start with. */
function readBanner(lines: string[]): { length: number; version?: string; cwd?: string } {
  let i = 0;
  while (i < lines.length && lines[i] === "") i++;
  if (!lines[i]?.trimStart().startsWith("╭")) return { length: 0 };
  const start = i;
  while (i < lines.length && !lines[i]?.trimStart().startsWith("╰")) i++;
  const text = lines.slice(start, i + 1).join("\n");
  const version = /Claude Code v?(\d+\.\d+\.\d+)/.exec(text)?.[1];
  // Prefer the labelled "cwd:" line; otherwise the first thing that looks like a real path.
  const cwd = (/cwd:\s*([^\s│]+)/.exec(text) ?? /\s((?:~|\/)[\w.@-]+\/[^\s│]*)/.exec(text))?.[1];
  return { length: i + 1, ...(version && { version }), ...(cwd && { cwd }) };
}

function toItem(block: RawBlock, wrapWidth: number, output?: string): Item | null {
  const raw = { ...block, lines: block.lines.slice(0, lastNonBlank(block.lines) + 1) };
  const first = raw.lines[0]?.text ?? "";
  if (raw.type === "status") {
    if (/^Thinking/i.test(first)) {
      return { kind: "thinking", blocks: toBlocks(raw.lines.slice(1), wrapWidth) };
    }
    return { kind: "status", text: unwrapText(raw.lines, wrapWidth), ...(output && { output }) };
  }
  if (raw.lines.length === 0 && !output) return null;

  // A tool call is "Name(args)" on the first logical line, e.g. Bash(npm test), Update(src/a.ts),
  // Web Search("query"), mcp__github__get_issue (MCP)(id: 1). Args may wrap onto more lines.
  const blank = raw.lines.findIndex((l) => l.text === "");
  const firstParagraph = blank === -1 ? raw.lines : raw.lines.slice(0, Math.max(1, blank));
  const header = unwrapText(firstParagraph, wrapWidth).replace(/\n/g, " ");
  const tool =
    /^((?:[A-Z][\w.:-]*|mcp__[\w-]+)(?: [A-Z][\w.:-]*)*(?: \(MCP\))?)\(([\s\S]*?)\)?$/.exec(header);
  if (tool && raw.lines.length === firstParagraph.length) {
    return {
      kind: "tool",
      name: tool[1] as string,
      args: tool[2] ?? "",
      ...(output && { output }),
    };
  }
  // Collapsed summaries such as "Read 3 files (ctrl+o to expand)".
  const summary = /^(.*?)\s*\(ctrl\+\w to expand\)$/.exec(header);
  if (summary && raw.lines.length === firstParagraph.length) {
    return { kind: "tool", name: summary[1] as string, args: "", ...(output && { output }) };
  }
  return { kind: "text", blocks: toBlocks(raw.lines, wrapWidth), ...(output && { output }) };
}

/** Splits a message into paragraphs and classifies each as prose, code or a horizontal rule. */
function toBlocks(lines: Raw[], wrapWidth: number): Block[] {
  const blocks: Block[] = [];
  let group: Raw[] = [];
  const flush = () => {
    if (group.length) blocks.push(classify(group, wrapWidth));
    group = [];
  };
  for (const line of lines) {
    if (line.text.trim() === "") flush();
    else if (RULE.test(line.text)) {
      flush();
      blocks.push({ kind: "rule" });
    } else group.push(line);
  }
  flush();
  return blocks;
}

const RULE = /^\s*[─━═]{8,}\s*$/;
const BOX = /^\s*[┌┬┐├┼┤└┴┘│╭╮╰╯]/;
const LIST = /^([-*•]|\d{1,3}[.)])\s+/;
const CODE_LINE =
  /[;{}]\s*$|^\s*[}\])]|=>|^\s*(?:if|for|while|return|const|let|var|def|function|class|import|from|export|public|private|static|int|void|#include|SELECT|INSERT|UPDATE|DELETE)\b|\w\(.*\)\s*$/;

function classify(group: Raw[], wrapWidth: number): Block {
  const texts = group.map((l) => l.text);
  const looksLikeCode =
    texts.some((t) => BOX.test(t)) ||
    (!texts.some((t) => LIST.test(t.trimStart())) &&
      texts.every((t) => CODE_LINE.test(t) || t.trim().length <= 2));
  if (looksLikeCode) {
    const minIndent = Math.min(...texts.map((t) => t.length - t.trimStart().length));
    return { kind: "code", text: texts.map((t) => t.slice(minIndent)).join("\n") };
  }
  return { kind: "prose", lines: unwrap(group, wrapWidth) };
}

/**
 * Rejoins lines the terminal wrapped. A break is a soft wrap only if the next line's first word
 * would not have fitted on the line, and the next line continues at the same hanging indent.
 * Any other break was in the original text and is kept.
 */
export function unwrap(group: Raw[], wrapWidth: number): Line[] {
  const out: Line[] = [];
  let prev: Raw | null = null;
  for (const raw of group) {
    const parsed = parseLine(raw.text);
    const last = out.at(-1);
    if (prev && last && !parsed.marker && isSoftWrap(prev, raw, wrapWidth)) {
      last.text += ` ${parsed.text}`;
    } else {
      out.push(parsed);
    }
    prev = raw;
  }
  return out;
}

/**
 * Claude Code's Markdown renderer wraps a few columns short of the terminal width, so a word that
 * would just have fitted can still be on the next line. Breaks within this many columns of the
 * edge count as wraps.
 */
const WRAP_SLACK = 8;

function isSoftWrap(prev: Raw, next: Raw, wrapWidth: number): boolean {
  const nextTrimmed = next.text.trimStart();
  const firstWord = nextTrimmed.split(" ")[0] ?? "";
  if (prev.width + 1 + displayWidth(firstWord) <= wrapWidth - WRAP_SLACK) return false;
  const prevLine = parseLine(prev.text);
  const nextIndent = next.text.length - nextTrimmed.length;
  // Rendered lists continue at the hanging indent; text you typed continues further left. A
  // deeper indent means a nested item or code, which is never a wrap.
  return nextIndent <= prevLine.indent + prevLine.marker.length;
}

function parseLine(text: string): Line {
  const trimmed = text.trimStart();
  const indent = text.length - trimmed.length;
  const marker = LIST.exec(trimmed)?.[0] ?? "";
  return { indent, marker, text: trimmed.slice(marker.length) };
}

function unwrapText(lines: Raw[], wrapWidth: number): string {
  return unwrap(lines, wrapWidth)
    .map((l) => " ".repeat(l.indent) + l.marker + l.text)
    .join("\n");
}

export function plainText(blocks: Block[]): string {
  return blocks
    .map((b) =>
      b.kind === "code"
        ? b.text
        : b.kind === "rule"
          ? ""
          : b.lines.map((l) => l.marker + l.text).join("\n"),
    )
    .join("\n\n");
}

function lastNonBlank(lines: Raw[]): number {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i]?.text.trim()) return i;
  return -1;
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === "") start++;
  while (end > start && lines[end - 1] === "") end--;
  return lines.slice(start, end);
}

/** Shortens to at most `max` characters, cutting at a word boundary. */
function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Claude Code names exports `YYYY-MM-DD-HHMMSS-<first-prompt-slug>.txt`, or
 * `conversation-YYYY-MM-DD-HHMMSS.txt` when there is no first prompt. Browsers may add " (1)".
 */
export function parseFileName(fileName?: string): { exportedAt?: Date; title?: string } {
  const m =
    /(?:^|conversation-)(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(.+?))?(?: \(\d+\))?\.txt$/i.exec(
      fileName ?? "",
    );
  if (!m) return {};
  const [, y, mo, d, h, mi, s, slug] = m.map((v) => v ?? "");
  const exportedAt = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
  const title = slug ? slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : undefined;
  return { exportedAt, ...(title && { title }) };
}
