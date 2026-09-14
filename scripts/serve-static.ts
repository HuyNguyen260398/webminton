import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = "frontend/out";
const PORT = Number(process.env.PORT ?? 3100);

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  const rel = normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, "");
  for (const candidate of [rel, join(rel, "index.html"), `${rel}.html`]) {
    try {
      const body = await readFile(join(ROOT, candidate));
      res.writeHead(200, {
        "content-type": types[extname(candidate)] ?? "application/octet-stream",
        // Mirrors the deployed cache policy for the data file.
        "cache-control": candidate.endsWith("tournament.json")
          ? "no-cache"
          : "public, max-age=60",
      });
      return res.end(body);
    } catch {
      /* try the next candidate */
    }
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Không tìm thấy");
}).listen(PORT, "127.0.0.1", () =>
  console.log(`http://127.0.0.1:${PORT}`),
);
