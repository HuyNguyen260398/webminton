"use client";
import { useEffect, useState } from "react";
import type { ReadyAdmin } from "../../lib/use-admin";
import { formatDate } from "../../lib/format";
import { Card } from "../landing/primitives";
import { ConfirmButton } from "./fields";

interface Entry {
  version: number;
  at: string;
  actorEmail: string;
  commandType: string;
  requestId: string;
}

const LABELS: Record<string, string> = {
  seed: "Nạp dữ liệu từ file",
  updateInfo: "Sửa thông tin giải",
  setCourts: "Sửa danh sách sân",
  updateTeam: "Sửa đội",
  upsertAthlete: "Thêm hoặc sửa VĐV",
  removeAthlete: "Xoá VĐV",
  setFeePaid: "Tick hoặc bỏ tick lệ phí",
  setAthleteTeam: "Chuyển đội cho VĐV",
  setTeamDrawOpen: "Mở hoặc đóng tự bốc thăm",
  teamDraw: "VĐV tự bốc thăm",
  confirmDraw: "Bốc thăm chia đội",
  resetDraw: "Xoá kết quả bốc thăm",
  setLineup: "Sửa đội hình",
  publishLineup: "Công bố hoặc ẩn đội hình",
  setSchedule: "Xếp sân và giờ",
  callMatch: "Gọi trận",
  setScore: "Nhập tỉ số",
  setWalkover: "Xử thắng",
  clearResult: "Xoá kết quả trận",
  resolveTie: "Xếp hạng đội đồng hạng",
  createDuel: "Tạo bảng đấu 2 đội",
  resetDuel: "Xoá bảng đấu 2 đội",
  saveDuelMatch: "Sửa trận, tỉ số hoặc số smash",
  refereeMatch: "Trọng tài chấm điểm",
  setRefereeCode: "Tạo hoặc đổi mã trọng tài",
  setRefereeNames: "Sửa danh sách trọng tài",
  setRefereeOpen: "Mở hoặc đóng chấm điểm cho trọng tài",
  upsertSponsor: "Thêm hoặc sửa nhà tài trợ",
  removeSponsor: "Xoá nhà tài trợ",
  upsertIncome: "Thêm hoặc sửa khoản thu",
  removeIncome: "Xoá khoản thu",
  upsertExpense: "Thêm hoặc sửa khoản chi",
  removeExpense: "Xoá khoản chi",
  setFinancePublished: "Công bố hoặc ẩn thu chi",
};
const label = (type: string) =>
  type.startsWith("restore:")
    ? `Khôi phục phiên bản ${type.slice(8)}`
    : (LABELS[type] ?? type);

export function HistoryTab({ admin }: { admin: ReadyAdmin }) {
  const { view, query, restore, busy } = admin;
  const [entries, setEntries] = useState<Entry[] | null>(null);

  // Re-read whenever the version moves, so a restore shows up as a new row.
  useEffect(() => {
    let alive = true;
    void query<{ entries: Entry[] }>("/api/admin/history").then((res) => {
      if (alive && res) setEntries(res.entries);
    });
    return () => {
      alive = false;
    };
  }, [query, view.version]);

  if (!entries) return <p role="status">Đang tải lịch sử…</p>;
  return (
    <Card title="Lịch sử thay đổi">
      <p>
        Khôi phục không xoá gì: nó tạo một phiên bản mới giống hệt phiên bản
        được chọn.
      </p>
      <ul className="pick-list">
        {entries.map((e) => (
          <li key={e.version} data-version={e.version} className="admin-bar">
            <span>
              <strong>Phiên bản {e.version}</strong> · {label(e.commandType)}
              <br />
              <small>
                {formatDate(e.at)} · {e.actorEmail}
              </small>
            </span>
            <span className="spacer" />
            {e.version !== view.version && (
              <ConfirmButton
                label="Khôi phục"
                disabled={busy}
                onConfirm={() => restore(e.version)}
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
