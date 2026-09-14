# Bootstrap

Một lần duy nhất, để dựng hạ tầng cho `giaicaulong2026.nghuy.link`.

## 1. State bucket

`infra/bootstrap` tạo bucket chứa Terraform state (private, versioned,
`prevent_destroy`). Chạy trước tiên:

```bash
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply
```

## 2. Chuyển đổi từ stack cũ

Nếu tài khoản đã từng chạy layout `infra/envs/{dev,prod}` + `infra/modules/stack`,
**đọc `infra/README.md` trước khi apply**. Có hai việc phải làm thủ công:

- `aws_s3_bucket.data` mang `prevent_destroy`, nên `apply` sẽ báo lỗi chứ không
  xoá. Tải toàn bộ lịch sử `tournament.json` về trước, rồi mới gỡ bucket.
- Gộp `envs/prod` + `modules/stack` vào một root làm đổi địa chỉ mọi resource
  (`module.stack.aws_…` → `aws_…`). Cần `terraform state mv`, nếu không
  Terraform sẽ lên kế hoạch xoá và tạo lại bucket cùng distribution.

Nếu bắt đầu từ state trống thì đơn giản hơn: chọn `site_bucket_name` mới và dỡ
stack cũ riêng.

## 3. Apply

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars   # đặt tên bucket
terraform -chdir=infra init \
  -backend-config="bucket=<state-bucket>" \
  -backend-config="region=<region>"
terraform -chdir=infra plan      # đọc kỹ, không được xoá gì ngoài dự kiến
terraform -chdir=infra apply
```

Lần apply đầu chờ ACM xác thực qua DNS, thường vài phút. CloudFront mất thêm
5–15 phút để lan truyền.

## 4. Triển khai lần đầu

```bash
pnpm install && pnpm validate && pnpm build && pnpm run deploy
node --import tsx scripts/smoke-deployment.ts
```

Smoke check xác nhận trang trả về 200, `tournament.json` khớp schema, được
phục vụ `no-cache`, và không lộ trường riêng tư nào.

## Biến repo cần có

`AWS_DEPLOY_ROLE_ARN`, `AWS_PLAN_ROLE_ARN`, `AWS_REGION`, `STATE_BUCKET_NAME`.
Không còn biến Cognito nào — bản build không đọc output Terraform nữa.
