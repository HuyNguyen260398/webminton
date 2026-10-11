import type { ApiResponse } from "./router";

const http: Record<string, [number, string]> = {
  BAD_REQUEST: [400, "Yêu cầu không hợp lệ."],
  UNAUTHORIZED: [401, "Cần đăng nhập."],
  FORBIDDEN: [403, "Tài khoản này không có quyền quản trị."],
  NOT_FOUND: [404, "Không tìm thấy."],
  CONFLICT: [409, "Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại."],
  NOT_SEEDED: [503, "Chưa nạp dữ liệu giải. Chạy pnpm seed."],
};

// Refusals raised by packages/domain. Each is the organiser's to fix.
const domain: Record<string, string> = {
  INVALID_COMMAND: "Thao tác không hợp lệ.",
  INVALID_DOCUMENT: "Thay đổi này làm dữ liệu giải không hợp lệ.",
  INVALID_COURTS: "Mã sân bị trùng.",
  COURT_IN_USE: "Có trận đang xếp ở sân này.",
  INVALID_COURT: "Sân không tồn tại.",
  INVALID_TEAM: "Đội không hợp lệ.",
  INVALID_CAPTAIN: "Đội trưởng phải là VĐV của đội.",
  ATHLETE_NOT_FOUND: "Không tìm thấy VĐV.",
  ATHLETE_IN_LINEUP: "VĐV đang có tên trong đội hình — gỡ khỏi đội hình trước.",
  TEAM_DRAW_CLOSED: "BTC chưa mở bốc thăm, hoặc đã đóng rồi.",
  ALREADY_DRAWN: "Bạn đã có đội rồi — mỗi người chỉ bốc một lần.",
  DRAW_LOCKED: "Đã có trận được gọi hoặc đánh — không bốc thăm lại được.",
  MISSING_SKILL: "Còn VĐV đang thi đấu chưa có trình độ (1–3).",
  INSUFFICIENT_ROSTER: "Cần tối thiểu 8 nam và 8 nữ đang thi đấu.",
  DRAW_NOT_FOUND: "Không chia đều được sau 100 lần thử. Đổi mã bốc thăm khác.",
  UNSUPPORTED_FORMAT: "Thể thức giải không được hỗ trợ.",
  MATCH_NOT_FOUND: "Không tìm thấy trận đấu.",
  MATCH_LOCKED: "Trận đã có kết quả — xoá kết quả trước khi đổi đội hình.",
  INVALID_STATUS: "Trận này không ở trạng thái chờ.",
  INVALID_LINEUP: "Đội hình không hợp lệ: VĐV không thuộc đội, nghỉ thi đấu hoặc bị trùng.",
  INVALID_GENDER: "Đội hình sai giới tính so với nội dung thi đấu.",
  INVALID_SCORE: "Tỉ số không hợp lệ — mỗi séc tới 21, hơn 2 điểm, trần 25.",
  INVALID_WALKOVER: "Trận xử thắng phải có tỉ số 21–0.",
  INVALID_TIE: "Các đội này không đồng hạng, hoặc thứ tự xếp chưa đủ đội.",
  PLACEMENT_RESET_REQUIRED:
    "Đã có trận tranh hạng được đánh — xoá kết quả tranh hạng trước khi sửa vòng loại.",
  FEE_LINE_LOCKED:
    "Dòng lệ phí tự tính theo số VĐV đã tick — sửa ở mục Lệ phí tham gia.",
  MONEY_OVERFLOW: "Số tiền quá lớn.",
};

export function toResponse(e: unknown): ApiResponse {
  const code = e instanceof Error ? e.message : "";
  if (code in http)
    return { status: http[code][0], body: { code, message: http[code][1] } };
  if (code in domain)
    return { status: 422, body: { code, message: domain[code] } };
  console.error(e);
  return {
    status: 500,
    body: { code: "INTERNAL", message: "Lỗi hệ thống. Thử lại sau." },
  };
}
