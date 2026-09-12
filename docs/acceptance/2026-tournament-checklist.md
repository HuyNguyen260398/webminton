# Checklist nghiệm thu giải 2026

- [ ] Xác nhận ngày, lệ phí, liên hệ BTC, QR người nhận, số sân và roster thật.
- [ ] Bootstrap state bucket private/versioned, configure OIDC roles và GitHub environments.
- [ ] Seed create-only trên dev; kiểm tra public projection không có phone, note, phí cá nhân hoặc lineup kín.
- [ ] Nhập 24 VĐV với skillBand 1–3; bốc thăm, reload, xác nhận mỗi người đúng một đội.
- [ ] Xếp lịch nhiều sân, kiểm tra conflict, nhập 18 trận vòng bảng và xử tie bằng lý do.
- [ ] Xác nhận 6 trận tranh hạng, nhập đủ điểm, kiểm tra champion/runner-up/third.
- [ ] Đối soát 1.000.000 BTC + 500.000 tài trợ − 300.000 đã chi = 1.200.000; publish finance.
- [ ] Test hai admin với ETag conflict, retry cùng requestId và restore một version.
- [ ] Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, actionlint và Terraform checks.
- [ ] Review 390px/1440px, keyboard focus, reduced motion, route refresh và smoke production.

Production release requires explicit AWS account/environment approval. Until then,
the application is safe to validate locally and on a disposable dev stack.
