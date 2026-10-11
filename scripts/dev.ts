import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// `next dev` on :3000 plus the local API on :3100 that its dev-only rewrites
// point at (frontend/next.config.ts). One Ctrl-C stops both. Paths are taken
// from this file, so `pnpm dev` works from the repo root and from frontend/.
const root = fileURLToPath(new URL("..", import.meta.url));
const frontend = fileURLToPath(new URL("../frontend", import.meta.url));

// `--cloud` runs the local API over the real table and bucket. It gets its own
// port so that Playwright, which reuses whatever answers on :3100, can never
// run its tests against live data.
const cloud = process.argv.includes("--cloud");
const port = cloud ? "3200" : "3100";
// Next reads PORT too, so the API's port travels as LOCAL_API_PORT and only
// the API process is given PORT.
const env = {
  ...process.env,
  LOCAL_API_PORT: port,
  ...(cloud ? { WEBMINTON_CLOUD: "1" } : {}),
};

if (!cloud)
  console.log(
    "\n  Dữ liệu thử trong bộ nhớ. Muốn nối dữ liệu thật: pnpm dev:cloud\n",
  );

const children = [
  spawn("node", ["--import", "tsx", "scripts/serve-static.ts"], {
    cwd: root,
    env: { ...env, PORT: port },
    stdio: "inherit",
  }),
  spawn("pnpm", ["exec", "next", "dev"], {
    cwd: frontend,
    env,
    stdio: "inherit",
  }),
];

let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}

for (const child of children) child.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
