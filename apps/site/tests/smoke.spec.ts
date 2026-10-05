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
