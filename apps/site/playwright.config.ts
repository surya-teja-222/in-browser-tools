import { defineConfig, devices } from "@playwright/test";

// Smoke tests run against the production build, so CSP and static output are what users get.
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4321" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // --ignore-lock keeps the server in the foreground. Without it, Astro detaches the preview
    // server when run by an AI agent, and Playwright would then test a stale build.
    command: "pnpm build && astro preview --port 4321 --ignore-lock",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
