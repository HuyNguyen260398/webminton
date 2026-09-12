import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3100", headless: true },
  webServer: {
    command: "node --import tsx scripts/serve-preview.ts",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
