# Vận hành chất lượng

Mọi pull request và push vào `main` chạy workflow `Quality`. Workflow cài
dependency bằng lockfile, kiểm tra format/lint/type, unit/API tests, build
Lambda và static export, rồi chạy Playwright trên preview local. Terraform dev
và prod được format, init không backend và validate trong cùng required check.

`Terraform plan` chỉ chạy thủ công trên `main` hoặc tag qua workflow plan, với
GitHub Environment và role OIDC đọc state. Không cấp AWS credentials cho fork
pull request; artifact test chỉ được tải khi job thất bại.
