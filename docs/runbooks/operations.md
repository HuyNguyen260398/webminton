# Vận hành

## Điều hành giải

Mở `https://giaicaulong2026.nghuy.link/quan-tri/` trên điện thoại hoặc máy
tính, đăng nhập bằng Google. Mọi thay đổi lưu vào cơ sở dữ liệu và hiện trên
trang giải trong vòng 20 giây — người xem không cần tải lại.

| Việc | Mục |
| --- | --- |
| Nhập, sửa tỉ số; xử thắng; gọi trận | Trận |
| Đội hình từng trận, công bố đội hình; sân và giờ | Trận |
| Phân định đội đồng hạng | Trận (hiện ra khi vòng loại xong và có đội bằng nhau) |
| Bốc thăm, đổi tên đội, đội trưởng, chuyển VĐV | Đội |
| Thêm, sửa, xoá VĐV; trình độ, số điện thoại, ghi chú | VĐV |
| Nhà tài trợ, khoản thu, khoản chi, công bố thu chi | Thu chi |
| Ngày giờ, địa điểm, lệ phí, link đăng ký, sân | Giải |
| Xem ai sửa gì, khôi phục phiên bản cũ | Lịch sử |

Đội hình chưa công bố không hiện trên trang giải. Sáu trận tranh hạng tự xuất
hiện khi 18 trận vòng loại có kết quả và không còn đội đồng hạng.

Bốc thăm cần tối thiểu 8 nam và 8 nữ đang thi đấu, ai cũng có trình độ 1–3.
Xem trước theo một mã rồi mới xác nhận; khi đã có trận được gọi hoặc đánh thì
không bốc lại được.

### Các thông báo hay gặp

- **“Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại.”** Một máy khác vừa lưu.
  Màn hình đã tải lại số liệu mới; xem lại rồi nhập lại nếu vẫn cần.
- **“Chưa công bố” ở đầu trang.** Đã lưu nhưng chưa ghi được ra trang giải.
  Bấm **Công bố lại**.
- **“Phiên đăng nhập đã hết hạn.”** Đăng nhập lại; thao tác đang dở được lưu
  tiếp tự động. Mỗi lần đăng nhập dùng được 12 giờ.
- **“Đã có trận tranh hạng được đánh…”** Sửa tỉ số vòng loại sẽ đổi cặp tranh
  hạng. Xoá kết quả các trận tranh hạng trước, rồi sửa.

## Khi trang quản trị không vào được

Trang giải vẫn hiện bản công bố gần nhất. Để cập nhật bằng máy tính:

```bash
# tải bản đang công bố về làm gốc
aws s3 cp "s3://$(terraform -chdir=infra output -raw site_bucket_name)/tournament.json" frontend/public/tournament.json
# sửa file bằng editor
pnpm validate
aws s3 cp frontend/public/tournament.json "s3://$(terraform -chdir=infra output -raw site_bucket_name)/tournament.json" \
  --cache-control "no-cache" --content-type "application/json; charset=utf-8"
```

Khi trang quản trị hoạt động lại, **nạp file đó vào cơ sở dữ liệu trước khi
sửa gì khác**, nếu không lần lưu kế tiếp sẽ ghi đè những gì vừa sửa tay:

```bash
pnpm seed --force
```

## Triển khai mã nguồn

`pnpm run deploy` (và workflow Deploy) **không** tải `tournament.json` lên —
file đó do cơ sở dữ liệu quản lý. Triển khai giữa giải không làm mất tỉ số.

## Thêm người quản trị

Thêm email Google vào `admin_emails` (file `infra/terraform.tfvars` và biến
`ADMIN_EMAILS` trên GitHub), rồi apply hoặc chạy workflow Deploy.

## Chất lượng

Mọi pull request và push vào `main` chạy workflow `Quality`: lint, hai bước
typecheck, unit test, `pnpm validate`, build, Playwright trên bản tĩnh, và
`terraform fmt`/`validate`. `Terraform plan` chạy thủ công qua workflow riêng
với role OIDC chỉ đọc state. Fork pull request không được cấp AWS credentials.
