import { build } from "esbuild";

// One ESM file for the Lambda. The AWS SDK ships in the nodejs24.x runtime,
// so it stays external; zod and the domain package are bundled in.
await build({
  entryPoints: ["src/handler.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: ["@aws-sdk/*"],
  minify: false,
  sourcemap: false,
  logLevel: "info",
});
