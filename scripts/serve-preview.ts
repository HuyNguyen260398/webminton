import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { MemoryRepository } from "../backend/src/storage/memory-repository";
import { makeTournament } from "../packages/domain/src/testing/fixtures";
import { route } from "../backend/src/router";
const repo = new MemoryRepository(makeTournament()),
  root = resolve("frontend/out");
createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    let body = "";
    for await (const c of req) {
      body += c;
      if (body.length > 256 * 1024) {
        res.writeHead(413).end();
        return;
      }
    }
    const r = await route(
      repo,
      {
        method: req.method ?? "GET",
        path: url.pathname,
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [
            k,
            typeof v === "string" ? v : undefined,
          ]),
        ),
        body,
        claims:
          req.headers.authorization === "Bearer local-test-token"
            ? {
                sub: "test-admin",
                iss: "local",
                client_id: "local",
                token_use: "access",
                scope: "tournament/admin",
                "cognito:groups": "admins",
              }
            : undefined,
      },
      { issuer: "local", clientId: "local" },
    );
    res.writeHead(r.statusCode, r.headers).end(r.body);
    return;
  }
  try {
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith("/")) path += "index.html";
    else if (!extname(path)) path += "/index.html";
    const target = resolve(root, "." + path);
    if (!target.startsWith(root + "/")) throw new Error();
    const body = await readFile(target);
    const mime: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".jpg": "image/jpeg",
      ".png": "image/png",
      ".woff2": "font/woff2",
      ".svg": "image/svg+xml",
    };
    res
      .writeHead(200, {
        "Content-Type": mime[extname(target)] ?? "application/octet-stream",
      })
      .end(body);
  } catch {
    res.writeHead(404).end("Không tìm thấy trang.");
  }
}).listen(3100, "127.0.0.1", () =>
  console.log("Preview http://127.0.0.1:3100"),
);
