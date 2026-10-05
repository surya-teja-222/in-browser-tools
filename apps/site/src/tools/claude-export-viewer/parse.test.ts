import { describe, expect, it } from "vitest";
import { toMarkdown } from "./markdown";
import { type Block, displayWidth, parseExport, parseFileName } from "./parse";
import { SAMPLE_EXPORT, SAMPLE_FILE_NAME } from "./sample";

const proseText = (b: Block | undefined) =>
  b?.kind === "prose" ? b.lines.map((l) => l.marker + l.text).join("\n") : undefined;

describe("parseExport on the sample", () => {
  const t = parseExport(SAMPLE_EXPORT, SAMPLE_FILE_NAME);

  it("reads the banner and file name", () => {
    expect(t.cwd).toBe("/Users/mira/code/booking-widget");
    expect(t.title).toBe("The date picker test is failing can you fix it");
    expect(t.exportedAt).toEqual(new Date(2026, 9, 5, 9, 15, 12));
  });

  it("groups lines into turns", () => {
    expect(t.turns.map((turn) => turn.role)).toEqual([
      "user",
      "assistant",
      "user",
      "user",
      "assistant",
    ]);
    expect(t.stats).toEqual({ prompts: 3, replies: 2, toolCalls: 4 });
  });

  it("unwraps the first prompt into one line", () => {
    const first = t.turns[0];
    expect(first?.role === "user" && proseText(first.blocks[0])).toBe(
      "The date picker test is failing. Can you fix it? It started after I bumped the timezone library last week.",
    );
  });

  it("classifies assistant items", () => {
    const reply = t.turns[1];
    if (reply?.role !== "assistant") throw new Error("expected assistant turn");
    expect(reply.items.map((i) => (i.kind === "tool" ? `tool:${i.name}` : i.kind))).toEqual([
      "thinking",
      "text",
      "tool:Bash",
      "tool:Read 2 files",
      "text",
      "tool:Update",
      "tool:Bash",
      "text",
    ]);
    const bash = reply.items[2];
    expect(bash).toMatchObject({ kind: "tool", args: "npm test -- DatePicker" });
    expect(bash?.kind === "tool" && bash.output?.split("\n")[0]).toBe(
      "FAIL  src/DatePicker.test.tsx",
    );
  });

  it("keeps list items separate and joins their wrapped lines", () => {
    const reply = t.turns[1];
    if (reply?.role !== "assistant") throw new Error("expected assistant turn");
    const explanation = reply.items[4];
    if (explanation?.kind !== "text") throw new Error("expected text");
    expect(explanation.blocks[0]?.kind).toBe("prose");
    expect(proseText(explanation.blocks[2])).toBe(
      "1. Build the date in local time in the test, so it matches what a user would pick in the calendar.\n" +
        "2. Pass the timezone explicitly to formatDay so the output no longer depends on the machine running the test.",
    );
  });

  it("attaches slash command output to the prompt", () => {
    expect(t.turns[2]).toMatchObject({ role: "user", output: "Total cost: $0.04" });
  });
});

describe("parseExport edge cases", () => {
  it("does not join lines that were short in the original", () => {
    const t = parseExport("⏺ Problem:\n  Return the maximum profit.\n");
    const turn = t.turns[0];
    expect(
      turn?.role === "assistant" &&
        turn.items[0]?.kind === "text" &&
        proseText(turn.items[0].blocks[0]),
    ).toBe("Problem:\nReturn the maximum profit.");
  });

  it("detects code and rules", () => {
    const t = parseExport(
      "❯ int minPrice=INT_MAX;\n  for(int price:prices){\n  }\n\n⏺ Score: 2/5\n  ────────────────────\n  Score: 3/5\n",
    );
    expect(t.turns[0]).toMatchObject({
      role: "user",
      blocks: [{ kind: "code", text: "int minPrice=INT_MAX;\nfor(int price:prices){\n}" }],
    });
    const reply = t.turns[1];
    expect(
      reply?.role === "assistant" &&
        reply.items[0]?.kind === "text" &&
        reply.items[0].blocks.map((b) => b.kind),
    ).toEqual(["prose", "rule", "prose"]);
  });

  it("accepts the older > prompt marker and Windows line endings", () => {
    const t = parseExport("> hello\r\n\r\n⏺ Hi there.\r\n");
    expect(t.turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
  });

  it("returns no turns for unrelated text", () => {
    expect(parseExport("just some notes\nwithout markers").stats.prompts).toBe(0);
  });

  it("measures wide characters", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("日本")).toBe(4);
    expect(displayWidth("⏺ ")).toBe(2);
  });
});

describe("parseFileName", () => {
  it.each([
    ["conversation-2026-03-14-071530.txt", new Date(2026, 2, 14, 7, 15, 30), undefined],
    ["2026-10-05-091512-fix-the-tests.txt", new Date(2026, 9, 5, 9, 15, 12), "Fix the tests"],
    ["2026-10-05-091512-fix-the-tests (1).txt", new Date(2026, 9, 5, 9, 15, 12), "Fix the tests"],
  ])("%s", (name, exportedAt, title) => {
    expect(parseFileName(name)).toEqual({ exportedAt, ...(title && { title }) });
  });

  it("ignores other names", () => {
    expect(parseFileName("notes.txt")).toEqual({});
  });
});

describe("toMarkdown", () => {
  it("renders turns, tools and code", () => {
    const md = toMarkdown(parseExport(SAMPLE_EXPORT, SAMPLE_FILE_NAME));
    expect(md).toMatch(/^# The date picker test is failing can you fix it\n/);
    expect(md).toContain("## You\n\nThe date picker test is failing.");
    expect(md).toContain("<summary>Bash(npm test -- DatePicker)</summary>");
    expect(md).toContain("<summary>Thinking</summary>");
    expect(md).toContain("```\nTotal cost: $0.04\n```");
  });
});
