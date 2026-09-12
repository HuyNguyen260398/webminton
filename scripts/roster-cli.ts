import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import {
  parseRosterConfig,
  rosterDiff,
  applyRosterConfig,
} from "./roster-config";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { file: { type: "string" }, "request-id": { type: "string" } },
});
const action = positionals[0],
  file = values.file;
if (!file) throw new Error("Cần --file trỏ tới JSON riêng tư");
async function request(path: string, init: RequestInit = {}) {
  const base = process.env.WEBMINTON_URL,
    token = process.env.WEBMINTON_ACCESS_TOKEN;
  if (!base || !token)
    throw new Error("Cần WEBMINTON_URL và WEBMINTON_ACCESS_TOKEN");
  const r = await fetch(new URL(path, base), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!r.ok)
    throw new Error(
      `Không thể cập nhật (${r.status}); giữ file và ETag gốc, kiểm tra lại dữ liệu.`,
    );
  return { body: await r.json(), etag: r.headers.get("etag") };
}
if (action === "export") {
  const r = await request("/api/admin/tournament");
  await writeFile(
    file,
    JSON.stringify({ etag: r.etag, athletes: r.body.athletes }, null, 2) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  console.log("Đã xuất danh sách VĐV.");
} else {
  const config = parseRosterConfig(JSON.parse(await readFile(file, "utf8")));
  if (action === "validate")
    console.log(`Hợp lệ: ${config.athletes.length} VĐV.`);
  else if (action === "diff") {
    const r = await request("/api/admin/tournament");
    console.log(
      JSON.stringify(
        {
          stale: r.etag !== config.etag,
          ...rosterDiff(r.body.athletes, config.athletes),
        },
        null,
        2,
      ),
    );
  } else if (action === "apply") {
    // Persist this ID beside the command before sending; reuse it after a timeout.
    const requestId = values["request-id"] ?? randomUUID();
    console.log(
      `Mã yêu cầu: ${requestId}. Khi thử lại, dùng --request-id ${requestId}`,
    );
    await applyRosterConfig(
      config,
      requestId,
      async (command, etag) =>
        (
          await request("/api/admin/commands", {
            method: "POST",
            headers: { "Content-Type": "application/json", "If-Match": etag },
            body: JSON.stringify(command),
          })
        ).body,
    );
    console.log("Đã cập nhật danh sách VĐV.");
  } else throw new Error("Chọn export, validate, diff hoặc apply");
}
