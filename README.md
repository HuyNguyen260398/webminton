# Webminton

Trang thông tin **Giải cầu lông nội bộ 2026** — Hội lông thủ CN1416.

Một trang tĩnh duy nhất, dựng lại đúng ba trang poster trong
`assets/poster_designs/`, chạy tại
[giaicaulong2026.nghuy.link](https://giaicaulong2026.nghuy.link).

Không có backend, không có cơ sở dữ liệu, không có trang quản trị. Toàn bộ giải
nằm trong một file JSON đi kèm ứng dụng.

## Bắt đầu

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Sửa `frontend/public/tournament.json` rồi tải lại trang — không cần build lại.

## Quy trình

| Việc | Lệnh |
| --- | --- |
| Sửa thông tin giải, tỉ số, thu chi | mở `frontend/public/tournament.json` |
| Kiểm tra file có hợp lệ không | `pnpm validate` |
| Bốc thăm chia đội | `pnpm draw <seed>` |
| Build bản tĩnh | `pnpm build` |
| Triển khai | `pnpm run deploy` |

`pnpm validate` phân tích file theo schema, tính lại kết quả, và kiểm tra lịch
thi đấu có trùng sân hay trùng VĐV không. Nó chạy trong CI, nên một file hỏng
sẽ không lên được production.

> Dùng `pnpm run deploy`, **không phải** `pnpm deploy` — pnpm có lệnh `deploy`
> riêng và sẽ không gọi tới script.

## Bốc thăm

Danh sách VĐV đầy đủ (có số điện thoại và trình độ) nằm trong
`.private/roster.json` — file này **không** được commit và **không** được triển
khai.

```bash
cp .private/roster.example.json .private/roster.json
# điền VĐV, mỗi người cần skillBand 1–3
pnpm draw mua-2026
pnpm validate
```

`pnpm draw` chia đều bốn đội theo giới tính, rồi theo trình độ, rồi theo sĩ số,
và chỉ ghi phần công khai — tên, giới tính, đội — vào `tournament.json`. Số điện
thoại và trình độ không bao giờ rời khỏi máy của bạn.

Cần tối thiểu 8 nam và 8 nữ đang thi đấu.

## Hiển thị dần

Các mục dữ liệu tự ẩn khi chưa có gì:

- chưa có VĐV → không hiện `DANH SÁCH VĐV`
- chưa bốc thăm → không hiện `BỐN ĐỘI` và `LỊCH THI ĐẤU`
- chưa đánh trận nào → không hiện `BẢNG XẾP HẠNG`
- `finance.published: false` → không hiện `THU CHI`

Nên hôm nay trang chỉ là ba trang poster, và tự đầy lên khi giải diễn ra.

## Kiểm thử

```bash
pnpm test        # domain, scripts, frontend, infra
pnpm build && pnpm test:e2e
```

## Tài liệu

- `CLAUDE.md` — kiến trúc và các quy tắc cần biết trước khi sửa code
- `docs/runbooks/` — bootstrap, vận hành, rollback
- `infra/README.md` — hạ tầng và các bước chuyển đổi state
