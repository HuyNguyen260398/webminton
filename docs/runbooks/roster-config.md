# Quản lý danh sách VĐV bằng JSON

Danh sách chính nằm trong S3 tournament.json. Công cụ này chỉ thay mảng athletes, giữ nguyên tài chính và kết quả. Cần Node 24, dependencies đã cài và access token Cognito của admin có scope tournament/admin. Không ghi token vào Git hoặc truyền token bằng tham số command line.

1. Đặt `WEBMINTON_URL` và `WEBMINTON_ACCESS_TOKEN` trong môi trường shell riêng.
2. Chạy `pnpm roster export --file .private/roster.json` sau khi tạo thư mục `.private`. File mới dùng quyền 0600 và không ghi đè file đã có.
3. Sửa athletes thủ công; giữ nguyên etag và id của người đã đăng ký. gender là male/female, skillBand là 1/2/3 (1 cao nhất). Trước bốc thăm, teamId=null. Không thay đổi thành viên sau khi đã chốt đội.
4. Chạy `pnpm roster validate --file .private/roster.json` rồi `pnpm roster diff --file .private/roster.json`.
5. Chạy `pnpm roster apply --file .private/roster.json`. Ghi lại mã yêu cầu in trước khi gửi; nếu timeout, dùng lại `--request-id` đó với cùng file.

Nếu diff báo stale hoặc apply trả 409, xuất bản mới vào file khác, đối chiếu chỉnh sửa thủ công, validate/diff lại rồi gửi với mã yêu cầu mới. Không sửa ETag để ép ghi. Server chặn xóa VĐV có trận/đóng phí và thay thành viên khi đội đã chốt. CLI sẽ được kết nối với API ở Task 7; không có đăng ký hoặc import Excel trong giao diện.
