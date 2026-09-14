# Vận hành

## Sửa thông tin giải

Toàn bộ giải nằm trong `frontend/public/tournament.json`.

```bash
# sửa file bằng editor
pnpm validate          # bắt buộc — bắt lỗi schema, tỉ số, trùng lịch
pnpm build
pnpm run deploy
```

## Đường tắt trong ngày thi đấu

`tournament.json` được phục vụ `no-cache` và nằm ngoài bản build, nên để cập
nhật tỉ số **không cần build lại**:

```bash
pnpm validate
aws s3 cp frontend/public/tournament.json "s3://$(terraform -chdir=infra output -raw site_bucket_name)/tournament.json" \
  --cache-control "no-cache"
aws cloudfront create-invalidation \
  --distribution-id "$(terraform -chdir=infra output -raw distribution_id)" \
  --paths "/tournament.json"
```

Trang tự tính lại bảng xếp hạng, đội vô địch và giải thưởng từng nội dung ngay
khi tải lại — không có bảng xếp hạng nào được lưu sẵn để lệch với tỉ số.

## Bốc thăm

```bash
cp .private/roster.example.json .private/roster.json   # điền VĐV + skillBand
pnpm draw mua-2026
pnpm validate
```

Chỉ phần công khai được ghi vào `tournament.json`. `pnpm draw` từ chối chạy lại
khi đã có trận được đánh (`DRAW_LOCKED`) — muốn bốc lại thì đặt mọi trận về
`pending` trước.

## Công bố dần

| Muốn hiện | Sửa |
| --- | --- |
| Danh sách VĐV | thêm vào `athletes` |
| Bốn đội, lịch thi đấu | `pnpm draw` |
| Đội hình từng trận | `lineupPublished: true` |
| Bảng xếp hạng | nhập tỉ số, `status: "completed"` |
| Thu chi | `finance.published: true` |
| Lệ phí | `info.feeVnd` (thay `???` trên trang) |

## Chất lượng

Mọi pull request và push vào `main` chạy workflow `Quality`: lint, hai bước
typecheck, unit test, `pnpm validate`, build, Playwright trên bản tĩnh, và
`terraform fmt`/`validate`. `Terraform plan` chạy thủ công qua workflow riêng
với role OIDC chỉ đọc state. Fork pull request không được cấp AWS credentials.
