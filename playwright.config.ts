import { defineConfig } from "@playwright/test";

// E2E_PORT runs the suite on its own server, so it can run beside a `pnpm dev`
// that is already holding :3100 — which it would otherwise reuse, and reset.
const port = process.env.E2E_PORT ?? "3100";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL, headless: true },
  webServer: {
    command: "node --import tsx scripts/serve-static.ts",
    env: { PORT: port },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
