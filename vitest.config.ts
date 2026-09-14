import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["frontend/test/setup.ts"],
    include: [
      "packages/**/test/**/*.test.ts",
      "scripts/test/**/*.test.ts",
      "frontend/test/**/*.test.ts",
      "frontend/test/**/*.test.tsx",
      "infra/test/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
});
