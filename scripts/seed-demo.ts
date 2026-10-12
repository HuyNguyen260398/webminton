import type { ApiResponse } from "../backend/src/router";

// `pnpm dev:demo` — fills the local dev server (`pnpm dev`, the in-memory
// store on :3100) with a giải that is ready to referee: two teams of seven,
// the twelve bảng đấu matches with their pairs, a code, refereeing open.
//
// It starts by resetting the server through /api/test/reset. That route does
// not exist on `pnpm dev:cloud` or on the deployed site, so against live data
// the first request fails and nothing else is sent.

export const DEMO_CODE = "123456";
const LOCAL = "http://127.0.0.1:3100";

export type Call = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<ApiResponse>;

interface View {
  version: number;
  document: {
    athletes: { id: string }[];
  };
  private: Record<
    string,
    { skillBand: number | null; phone: string | null; note: string }
  >;
}

// Six men and one woman a side, as on the day. One name is long on purpose:
// the referee's screen has to show it whole.
const RED = [
  "Nguyễn Văn Huy",
  "Trần Quốc Bảo",
  "Lê Minh Khôi",
  "Phạm Đức Anh",
  "Nguyễn Hoàng Phương Thảo Nguyên",
  "Hoàng Gia Long",
];
const BLUE = [
  "Vũ Thành Đạt",
  "Đặng Hải Nam",
  "Bùi Tuấn Kiệt",
  "Đỗ Trung Hiếu",
  "Ngô Nhật Minh",
  "Lý Quang Vinh",
];
export const DEMO_REFEREES = ["Cô Hạnh", "Anh Tuấn", "Chị Linh"];
const RED_WOMAN = "Trần Thị Mai";
const BLUE_WOMAN = "Phạm Ngọc Ánh";

export async function seedDemo(call: Call): Promise<void> {
  const reset = await call("POST", "/api/test/reset", {});
  if (reset.status !== 200)
    throw new Error(
      "Máy chủ này không cho reset (/api/test/reset) — đây không phải pnpm dev. Không ghi gì cả.",
    );

  let view = (await call("GET", "/api/admin/state")).body as View;
  let n = 0;
  async function send(type: string, payload: unknown) {
    const res = await call("POST", "/api/admin/commands", {
      baseVersion: view.version,
      requestId: `demo-${++n}`,
      command: { type, payload },
    });
    if (res.status !== 200)
      throw new Error(`${type}: ${JSON.stringify(res.body)}`);
    view = res.body as View;
  }

  // The fixture arrives as a confirmed four-team draw; the giải is two teams.
  await send("resetDraw", {});

  const roster = [
    ...RED.map((name) => ({ name, gender: "male", teamId: "red" })),
    { name: RED_WOMAN, gender: "female", teamId: "red" },
    ...BLUE.map((name) => ({ name, gender: "male", teamId: "blue" })),
    { name: BLUE_WOMAN, gender: "female", teamId: "blue" },
  ];
  const ids = view.document.athletes.map((a) => a.id);
  const priv = view.private;
  for (const id of ids.slice(roster.length))
    await send("removeAthlete", { id });
  for (const [i, a] of roster.entries()) {
    const id = ids[i];
    await send("upsertAthlete", {
      id,
      name: a.name,
      gender: a.gender,
      active: true,
      ...priv[id],
      skillBand: priv[id]?.skillBand ?? 2,
    });
    await send("setAthleteTeam", { athleteId: id, teamId: a.teamId });
  }
  // r[0..5] are the red men, r[6] the red woman; the same for blue.
  const r = ids.slice(0, 7);
  const b = ids.slice(7, 14);

  await send("setRefereeNames", { names: DEMO_REFEREES });
  await send("createDuel", {});
  const match = (
    matchId: string,
    pairRed: [string, string],
    pairBlue: [string, string],
    rest: Record<string, unknown> = {},
  ) =>
    send("saveDuelMatch", {
      matchId,
      pairRed,
      pairBlue,
      status: "pending",
      score: null,
      smashes: {},
      ...rest,
    });

  // Who plays which match, the same for both teams: indexes into r and b.
  // Every man is down for exactly three vòng loại matches and the woman for
  // two — the least the thể lệ gives them — nobody plays two in a row, and
  // nobody has more than one final.
  const PAIRS: Array<[string, number, number]> = [
    ["vong-loai-1", 0, 1],
    ["vong-loai-2", 3, 4],
    ["vong-loai-3", 2, 6], // đôi nam nữ
    ["vong-loai-4", 5, 3],
    ["vong-loai-5", 2, 0],
    ["vong-loai-6", 1, 4],
    ["vong-loai-7", 0, 3],
    ["vong-loai-8", 5, 6], // đôi nam nữ
    ["vong-loai-9", 2, 1],
    ["vong-loai-10", 5, 4],
    ["chung-ket-1", 0, 4],
    ["chung-ket-2", 1, 6], // đôi nam nữ
  ];
  const STATE: Record<string, Record<string, unknown>> = {
    // Trận 1: finished.
    "vong-loai-1": {
      status: "done",
      score: { red: 21, blue: 17 },
      referee: DEMO_REFEREES[0],
      smashes: {
        [r[0]]: { hit: 5, net: 1 },
        [r[1]]: { hit: 2, net: 0 },
        [b[0]]: { hit: 3, net: 2 },
        [b[1]]: { hit: 1, net: 1 },
      },
    },
    // Trận 2: being played — open it on /trong-tai and carry on from 11–9.
    "vong-loai-2": {
      status: "live",
      score: { red: 11, blue: 9 },
      referee: DEMO_REFEREES[1],
      smashes: { [r[3]]: { hit: 2, net: 0 }, [b[4]]: { hit: 1, net: 1 } },
    },
  };
  // Every other match has its pairs and waits for a referee to start it.
  for (const [matchId, x, y] of PAIRS)
    await match(matchId, [r[x], r[y]], [b[x], b[y]], STATE[matchId]);

  await send("setRefereeCode", { code: DEMO_CODE });
  await send("setRefereeOpen", { open: true });
}

if (import.meta.filename === process.argv[1]) {
  const call: Call = async (method, path, body) => {
    const res = await fetch(`${LOCAL}${path}`, {
      method,
      headers: {
        authorization: "Bearer test:admin@example.com",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  try {
    await seedDemo(call);
    console.log(
      [
        "",
        "✓ Đã nạp dữ liệu thử vào máy chủ dev (trong bộ nhớ — khởi động lại là mất).",
        "",
        "  2 đội × 7 VĐV · 12 trận: 1 đã xong, 1 đang đánh, 10 đã xếp cặp chờ đánh",
        `  Trọng tài: ${DEMO_REFEREES.join(", ")}`,
        "",
        "  Trọng tài   http://localhost:3000/trong-tai/        mã: " + DEMO_CODE,
        "  Quản trị    http://localhost:3000/quan-tri/#tran-dau  (bấm “Đăng nhập thử”)",
        "  Trang giải  http://localhost:3000/",
        "",
      ].join("\n"),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      message.includes("fetch failed")
        ? "✗ Không thấy máy chủ dev ở cổng 3100. Chạy `pnpm dev` ở một cửa sổ khác trước."
        : `✗ ${message}`,
    );
    process.exit(1);
  }
}
