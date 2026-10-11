import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { execFileSync } from "node:child_process";
import { awsPublisher, awsStore } from "../backend/src/aws";
import { createLocalApi, type CloudTarget } from "./local-api";

const terraformOutput = (name: string) =>
  execFileSync("terraform", ["-chdir=infra", "output", "-raw", name], {
    encoding: "utf8",
  }).trim();

// `pnpm dev:cloud` sets this. Names come from the environment or, like
// `pnpm seed`, from the Terraform outputs; credentials from the AWS profile.
function cloudTarget(): CloudTarget | undefined {
  if (process.env.WEBMINTON_CLOUD !== "1") return undefined;
  const table = process.env.TABLE_NAME ?? terraformOutput("table_name");
  const bucket = process.env.SITE_BUCKET ?? terraformOutput("site_bucket_name");
  console.log(
    [
      "",
      "  ⚠  DỮ LIỆU THẬT — không phải bản thử.",
      `     Bảng: ${table} · Bucket: ${bucket}`,
      "     Mỗi lần lưu ở /quan-tri sẽ ghi vào bảng thật và công bố ngay",
      "     lên trang giải. Sửa nhầm thì khôi phục ở tab Lịch sử.",
      "",
    ].join("\n"),
  );
  return { store: awsStore(table), publish: awsPublisher(bucket) };
}

const api = createLocalApi(cloudTarget());
await api.reset();

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

  if (url.startsWith("/api/")) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const result = await api.handle(
      req.method ?? "GET",
      url,
      chunks.length ? Buffer.concat(chunks).toString("utf8") : null,
      req.headers.authorization,
    );
    res.writeHead(result.status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    return res.end(JSON.stringify(result.body));
  }

  // Once an admin save has published, that snapshot replaces the built file —
  // the same thing the Lambda does to the bucket.
  const snapshot =
    url === "/tournament.json" ? await api.snapshot() : null;
  if (url === "/tournament.json" && snapshot !== null) {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-cache",
    });
    return res.end(snapshot);
  }

  const rel = normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, "");
  // `pnpm dev` sends /tournament.json here before any build exists, so the
  // seed file stands in for the built copy.
  const candidates = [
    join(ROOT, rel),
    join(ROOT, rel, "index.html"),
    join(ROOT, `${rel}.html`),
    ...(url === "/tournament.json" ? ["frontend/public/tournament.json"] : []),
  ];
  for (const candidate of candidates) {
    try {
      const body = await readFile(candidate);
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
