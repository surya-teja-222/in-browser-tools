import type { Block, Item, Transcript } from "./parse";

/** Converts a parsed transcript to Markdown. Tool calls and thinking become <details> sections. */
export function toMarkdown(t: Transcript): string {
  const out: string[] = [`# ${t.title}`];
  const meta = [
    t.exportedAt &&
      `Exported ${t.exportedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`,
    t.cwd && `in \`${t.cwd}\``,
  ].filter(Boolean);
  if (meta.length) out.push(meta.join(" "));

  for (const turn of t.turns) {
    if (turn.role === "user") {
      out.push("## You", blocks(turn.blocks));
      if (turn.output) out.push(fence(turn.output));
    } else {
      out.push("## Claude", ...turn.items.map(item));
    }
  }
  return `${out.filter(Boolean).join("\n\n")}\n`;
}

function item(i: Item): string {
  switch (i.kind) {
    case "text":
      return [blocks(i.blocks), i.output && fence(i.output)].filter(Boolean).join("\n\n");
    case "tool":
      return details(`${i.name}${i.args ? `(${i.args})` : ""}`, i.output ? fence(i.output) : "");
    case "thinking":
      return details("Thinking", blocks(i.blocks));
    case "status":
      return [`_${i.text}_`, i.output && fence(i.output)].filter(Boolean).join("\n\n");
  }
}

function blocks(list: Block[]): string {
  return list
    .map((b) => {
      if (b.kind === "rule") return "---";
      if (b.kind === "code") return fence(b.text);
      return b.lines.map((l) => " ".repeat(l.indent) + l.marker + l.text).join("\n");
    })
    .join("\n\n");
}

function details(summary: string, body: string): string {
  return `<details>\n<summary>${escapeHtml(summary)}</summary>\n\n${body}\n\n</details>`;
}

/** Fenced code block whose fence is longer than any backtick run inside it. */
function fence(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}\n${text}\n${ticks}`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
