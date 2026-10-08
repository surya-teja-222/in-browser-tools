import { expect, test } from "@playwright/test";
import { loadTools } from "../scripts/load-tools.ts";

const tools = await loadTools();

// Every live tool must load without console errors (which includes CSP violations) and render
// its island. New tools are covered automatically through the registry.
for (const tool of tools.filter((t) => t.status !== "planned")) {
  test(`${tool.slug} loads cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(`/${tool.slug}/`);
    await expect(page.getByRole("heading", { level: 1, name: tool.name })).toBeVisible();
    await expect(page.locator("astro-island")).not.toHaveAttribute("ssr", { timeout: 10_000 });
    await expect(page.getByLabel("Loading tool")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("index lists tools and filters them", async ({ page }) => {
  await page.goto("/");
  const live = tools.filter((t) => t.status !== "planned");
  for (const tool of live)
    await expect(page.getByRole("link", { name: new RegExp(tool.name) })).toBeVisible();

  await page.keyboard.press("/");
  await page.keyboard.type("zzz-no-such-tool");
  await expect(page.getByText("No tool matches that.")).toBeVisible();
});

test("json formatter formats and reports errors", async ({ page }) => {
  await page.goto("/json-formatter/");
  const input = page.getByLabel("Input");
  await input.fill('{"b":1,"a":[1,2]}');
  await expect(page.getByLabel("Formatted output")).toContainText('"a": [');
  await expect(page.locator("#json-status")).toContainText("Valid JSON");

  await input.fill('{"a":1,}');
  await expect(page.getByText("Line 1, column 7", { exact: true })).toBeVisible();
  await expect(page.getByText("Trailing comma before }", { exact: true })).toBeVisible();
});

test("claude export viewer reads a transcript and searches it", async ({ page }) => {
  await page.goto("/claude-export-viewer/");
  await page.getByRole("button", { name: "Try a sample" }).click();

  await expect(
    page.getByRole("heading", { name: "The date picker test is failing can you fix it" }),
  ).toBeVisible();
  await expect(page.getByText(/3 prompts, 2 replies, 4 tool calls\./)).toBeVisible();
  // Focus mode: the tool's own heading and docs make way for the conversation.
  await expect(page.getByRole("heading", { level: 1 })).toBeHidden();
  await expect(page.getByRole("region", { name: "About Claude export viewer" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Your prompt 1" })).toContainText(
    "It started after I bumped the timezone library last week.",
  );

  // Tool output is collapsed until opened.
  const bash = page.getByRole("button", { name: /Bash npm test -- DatePicker/ }).first();
  await expect(page.getByText("FAIL  src/DatePicker.test.tsx")).toHaveCount(0);
  await bash.click();
  await expect(page.getByText("FAIL  src/DatePicker.test.tsx")).toBeVisible();

  // Search counts matches, including ones inside collapsed tool output, and steps through them.
  await page.getByLabel("Search this conversation").fill("datepicker");
  await expect(page.getByText(/^1 of \d+$/)).toBeVisible();
  await page.getByLabel("Search this conversation").press("Enter");
  await expect(page.getByText(/^2 of \d+$/)).toBeVisible();
  await expect(page.locator("mark[data-current]")).toHaveCount(1);

  await page.getByRole("button", { name: "Close conversation" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Claude export viewer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try a sample" })).toBeVisible();
});

test("claude export viewer rejects unrelated text", async ({ page }) => {
  await page.goto("/claude-export-viewer/");
  await page.locator("input[type=file]").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("just some notes\nwithout any markers"),
  });
  await expect(page.getByRole("alert")).toContainText("doesn't look like a Claude Code export");
});

test("api health route runs on the server", async ({ request }) => {
  const res = await request.get("/api/health/");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");
  expect(await res.json()).toMatchObject({ ok: true });
});

test("cloudflare usage shows the sample report and forgets nothing", async ({ page }) => {
  await page.goto("/cloudflare-usage/");
  await expect(page.getByLabel("API token")).toBeVisible();
  await page.getByRole("button", { name: "Try a sample" }).click();

  await expect(page.getByRole("heading", { name: "Sample account" })).toBeVisible();
  await expect(page.getByText("Sample data.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workers KV" })).toBeVisible();
  // One metric is over its limit and one dataset failed in the sample.
  await expect(page.getByText("Over a limit")).toBeVisible();
  await expect(page.getByText("Not available")).toBeVisible();

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByLabel("API token")).toHaveValue("");
});

test("cloudflare usage api rejects calls without a token", async ({ request }) => {
  const res = await request.post("/api/cloudflare-usage/", { data: {} });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ kind: "error" });
});

test("cloudflare usage api accepts its own host as origin and refuses others", async ({
  request,
  baseURL,
}) => {
  const own = await request.post("/api/cloudflare-usage/", {
    data: {},
    headers: { Origin: baseURL as string },
  });
  // Same origin gets past the origin check and fails on the missing token instead.
  expect(own.status()).toBe(400);

  const other = await request.post("/api/cloudflare-usage/", {
    data: {},
    headers: { Origin: "https://evil.example" },
  });
  expect(other.status()).toBe(403);
});
