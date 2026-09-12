import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { TournamentSchema } from "../packages/domain/src/schema";
import { MemoryRepository } from "../backend/src/storage/memory-repository";
import { route } from "../backend/src/router";
const dataPath =
  process.env.LOCAL_DATA_FILE ?? ".private/local-tournament.json";
let content: string;
try {
  content = await readFile(dataPath, "utf8");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  content = await readFile("data/tournament.seed.json", "utf8");
}
const repo = new MemoryRepository(TournamentSchema.parse(JSON.parse(content)));
const token = process.env.LOCAL_ADMIN_TOKEN;
const config = { issuer: "local-test-issuer", clientId: "local-test-client" };
const server = createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 256 * 1024) {
        res.writeHead(413);
        res.end();
        return;
      }
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const claims =
      token && req.headers.authorization === `Bearer ${token}`
        ? {
            sub: "local-admin",
            iss: config.issuer,
            client_id: config.clientId,
            token_use: "access",
            scope: "tournament/admin",
            "cognito:groups": "admins",
          }
        : undefined;
    const result = await route(
      repo,
      {
        method: req.method ?? "GET",
        path: url.pathname,
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [
            k,
            Array.isArray(v) ? v[0] : v,
          ]),
        ),
        body,
        claims,
        cursor: url.searchParams.get("cursor") ?? undefined,
      },
      config,
    );
    if (req.method === "POST" && result.statusCode === 200) {
      await mkdir(".private", { recursive: true });
      await writeFile(
        dataPath,
        JSON.stringify((await repo.read()).document, null, 2),
        { mode: 0o600 },
      );
    }
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Lỗi máy chủ thử nghiệm." }));
  }
});
server.listen(Number(process.env.API_PORT ?? 3001), "127.0.0.1", () =>
  console.log(
    "API thử nghiệm tại http://127.0.0.1:3001; danh tính local chỉ tồn tại trong runner này.",
  ),
);
