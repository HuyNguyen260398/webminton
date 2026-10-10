# Rollback

Có ba thứ có thể quay lui, độc lập với nhau.

## 1. Quay lui dữ liệu giải

**Cách thường dùng:** mục **Lịch sử** trong trang quản trị → **Khôi phục** ở
phiên bản muốn quay về. Thao tác này tạo một phiên bản mới, không xoá gì.

**Khi bảng hỏng hoặc bị xoá nhầm:** bảng `webminton-tournament` bật
point-in-time recovery (35 ngày). Khôi phục sang bảng mới, kiểm tra, rồi nạp
lại hoặc đổi tên bảng trong Terraform:

```bash
aws dynamodb restore-table-to-point-in-time \
  --source-table-name webminton-tournament \
  --target-table-name webminton-tournament-restore \
  --restore-date-time 2026-10-18T09:30:00+07:00
```

**Chỉ cần trang giải quay về bản cũ ngay:** dùng các bản `tournament.json`
trong bucket như dưới đây, rồi chạy `pnpm seed --force` với đúng bản đó để cơ
sở dữ liệu khớp — nếu không, lần lưu kế tiếp từ trang quản trị sẽ ghi đè.

Bucket bật versioning, nên mọi bản `tournament.json` từng tải lên đều lấy lại
được.

```bash
BUCKET=$(terraform -chdir=infra output -raw site_bucket_name)

aws s3api list-object-versions --bucket "$BUCKET" --prefix tournament.json \
  --query 'Versions[].{V:VersionId,Time:LastModified}' --output table

aws s3api get-object --bucket "$BUCKET" --key tournament.json \
  --version-id <version-id> ./tournament.json
```

Kiểm tra rồi đưa trở lại:

```bash
cp ./tournament.json frontend/public/tournament.json
pnpm validate
aws s3 cp frontend/public/tournament.json "s3://$BUCKET/tournament.json" \
  --cache-control "no-cache" --content-type "application/json; charset=utf-8"
pnpm seed --force
```

Lịch sử không bị ghi đè: bản cũ được tải lên thành một version mới.

## 2. Quay lui bản build

Trang là kết quả build của một commit. Để quay lui, deploy lại commit cũ:

```bash
git checkout <sha>
pnpm install --frozen-lockfile && pnpm build && pnpm run deploy
```

Hoặc chạy lại workflow `Deploy` trên commit đó — nó pin `ref: github.sha`.

## 3. Quay lui hạ tầng

`terraform -chdir=infra plan` trên commit cũ, đọc kỹ kế hoạch, rồi apply.
Bucket mang `prevent_destroy`, nên một thay đổi nhầm sẽ báo lỗi chứ không xoá
dữ liệu.

## Kiểm tra sau khi quay lui

```bash
node --import tsx scripts/smoke-deployment.ts
```
