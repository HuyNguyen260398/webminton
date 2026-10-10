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

## 3. Đăng nhập Google cho trang quản trị

1. Lấy trước địa chỉ redirect — nó chỉ phụ thuộc vào số tài khoản AWS:

   ```bash
   echo "https://webminton-$(aws sts get-caller-identity --query Account --output text).auth.ap-southeast-1.amazoncognito.com/oauth2/idpresponse"
   ```

2. Vào Google Cloud Console → **APIs & Services → Credentials → Create
   credentials → OAuth client ID**, loại **Web application**. Dán địa chỉ trên
   vào **Authorized redirect URIs**. Nếu được hỏi, cấu hình OAuth consent
   screen ở chế độ External và thêm email BTC làm test user.
3. Điền vào `infra/terraform.tfvars`:

   ```hcl
   google_client_id     = "….apps.googleusercontent.com"
   google_client_secret = "…"
   admin_emails         = ["email-btc@gmail.com"]
   ```

`admin_emails` là danh sách duy nhất quyết định ai được sửa giải. Thêm người:
sửa biến này rồi apply lại.

## 4. Apply

```bash
pnpm install && pnpm build                                 # tạo backend/dist cho Lambda
cp infra/terraform.tfvars.example infra/terraform.tfvars   # đặt tên bucket + Google
terraform -chdir=infra init \
  -backend-config="bucket=<state-bucket>" \
  -backend-config="region=<region>"
terraform -chdir=infra plan      # đọc kỹ, không được xoá gì ngoài dự kiến
terraform -chdir=infra apply
```

Lần apply đầu chờ ACM xác thực qua DNS, thường vài phút. CloudFront mất thêm
5–15 phút để lan truyền. Role deploy của GitHub chỉ cập nhật được tài nguyên đã
có, nên lần tạo mới (bảng, Lambda, API, Cognito) luôn là apply từ máy này.

Kiểm tra `terraform -chdir=infra output google_redirect_uri` khớp với địa chỉ
đã nhập ở Google.

## 5. Nạp dữ liệu và triển khai lần đầu

```bash
pnpm seed                                    # nạp frontend/public/tournament.json vào bảng
pnpm validate && pnpm run deploy
node --import tsx scripts/smoke-deployment.ts
```

`pnpm seed` từ chối chạy nếu bảng đã có dữ liệu. `--force` ghi đè bằng nội
dung trong repo; bản cũ vẫn còn trong mục Lịch sử. Nếu có
`.private/roster.json`, trình độ, số điện thoại và ghi chú trong đó được nạp
kèm.

Smoke check xác nhận trang trả về 200, `tournament.json` khớp schema, được
phục vụ `no-cache`, không lộ trường riêng tư nào, `/api/config` trả lời và
`/api/admin/state` từ chối khi không có token.

## 6. Mở quyền cho GitHub

```bash
terraform -chdir=infra/bootstrap apply       # cấp thêm quyền Lambda/DynamoDB/API/Cognito cho role deploy
```

Nếu workflow Deploy báo `AccessDenied` cho một action, thêm action đó vào
statement tương ứng trong `infra/bootstrap/main.tf` rồi apply lại.

## Biến repo cần có

`AWS_DEPLOY_ROLE_ARN`, `AWS_PLAN_ROLE_ARN`, `AWS_REGION`, `STATE_BUCKET_NAME`,
`SITE_BUCKET_NAME`, đặt trong environment `prod`. `AWS_DEPLOY_ROLE_ARN` là output
`github_deploy_role_arn` của `infra/bootstrap`, chỉ có sau khi điền
`oidc_provider_arn`, `site_bucket_name`, `distribution_id` và `hosted_zone_id`.
Thêm cho trang quản trị: biến `GOOGLE_CLIENT_ID` và `ADMIN_EMAILS` (dạng JSON,
ví dụ `["email-btc@gmail.com"]`), và secret `GOOGLE_CLIENT_SECRET`. Bản build
vẫn không đọc output Terraform — trang quản trị lấy cấu hình đăng nhập từ
`/api/config`.
