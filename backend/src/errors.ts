const messages: Record<string, string> = {
  UNAUTHORIZED: "Vui lòng đăng nhập.",
  FORBIDDEN: "Bạn không có quyền quản trị.",
  CONFLICT: "Dữ liệu đã thay đổi. Giữ bản nháp và tải lại để đối chiếu.",
  PRECONDITION_REQUIRED: "Thiếu phiên bản dữ liệu. Vui lòng tải lại.",
  NOT_FOUND: "Không tìm thấy dữ liệu.",
  MATCH_NOT_FOUND: "Không tìm thấy trận đấu.",
  INVALID_SCORE: "Tỉ số không đúng luật 21/25.",
  INVALID_LINEUP: "Cặp đấu không hợp lệ.",
  INVALID_GENDER: "Cặp đấu không đúng nội dung.",
  SCHEDULE_CONFLICT: "Trùng sân hoặc VĐV trong khung giờ.",
  PLACEMENT_RESET_REQUIRED:
    "Cần đặt lại vòng tranh hạng trước khi sửa kết quả này.",
  MISSING_SKILL: "Cần nhập trình độ cho tất cả VĐV.",
  INSUFFICIENT_ROSTER: "Cần ít nhất 8 nam và 8 nữ cho thể thức hiện tại.",
  ROSTER_LOCKED: "Danh sách đã khóa sau khi chốt đội.",
  ATHLETE_IN_USE: "VĐV đã có trận hoặc đóng phí; không thể xóa.",
  DRAW_EXISTS: "Đã có bản bốc thăm. Hãy tiếp tục hoặc đặt lại.",
  DRAW_LOCKED: "Không thể bốc lại sau khi giải đã bắt đầu.",
  STALE_ROSTER: "Danh sách đã thay đổi sau bốc thăm.",
  CLEAR_SCORE_REQUIRED: "Cần xác nhận xóa điểm trước khi đổi cặp.",
  TOURNAMENT_INCOMPLETE: "Cần hoàn thành đủ 24 trận.",
  DOCUMENT_TOO_LARGE: "Dữ liệu vượt giới hạn. Liên hệ người vận hành.",
  PAYLOAD_TOO_LARGE: "Nội dung gửi quá lớn.",
};
export function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const status =
    (
      {
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        CONFLICT: 409,
        PRECONDITION_REQUIRED: 428,
        NOT_FOUND: 404,
        MATCH_NOT_FOUND: 404,
        PAYLOAD_TOO_LARGE: 413,
        DOCUMENT_TOO_LARGE: 413,
      } as Record<string, number>
    )[code] ??
    (error instanceof SyntaxError ||
    (error instanceof Error && error.name === "ZodError") ||
    /^(INVALID_|.*_LOCKED|.*_REQUIRED|.*_EXISTS|.*_IN_USE|MISSING_|INSUFFICIENT_|STALE_|DRAW_NOT_|TOURNAMENT_INCOMPLETE|SCHEDULE_CONFLICT|TEAM_ASSIGNMENT_)/.test(
      code,
    )
      ? 422
      : 500);
  return {
    statusCode: status,
    body: {
      code:
        status === 500
          ? "INTERNAL_ERROR"
          : error instanceof SyntaxError ||
              (error instanceof Error && error.name === "ZodError")
            ? "INVALID_INPUT"
            : code,
      message:
        messages[code] ??
        (status === 500
          ? "Không thể xử lý yêu cầu. Vui lòng thử lại."
          : "Dữ liệu không hợp lệ. Kiểm tra các trường đã nhập."),
    },
  };
}
