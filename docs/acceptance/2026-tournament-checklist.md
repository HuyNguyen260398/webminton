# Checklist nghiệm thu giải 2026

## Nội dung

- [ ] Xác nhận ngày thi đấu, lệ phí, tên và số điện thoại liên hệ BTC, link nhóm
      Zalo, số sân — cập nhật vào `info` trong `frontend/public/tournament.json`.
- [ ] Xác nhận mã QR quỹ giải đúng người nhận (`/qr/momo.jpg`, `qrPublished`).
- [ ] So trang với ba file trong `assets/poster_designs/` ở 1440px và 390px.

## Dữ liệu

- [ ] Điền 24 VĐV kèm `skillBand` 1–3 vào `.private/roster.json`.
- [ ] `pnpm draw <seed>` → bốn đội chia đều, mỗi đội ≥2 nam và ≥2 nữ.
- [ ] `grep -E '"(phone|skillBand)"' frontend/public/tournament.json` không ra
      kết quả nào trong `athletes`.
- [ ] Nhập 18 trận vòng loại; `pnpm validate` không báo trùng sân/trùng VĐV.
- [ ] Xác nhận 6 trận tranh hạng, nhập đủ điểm, kiểm tra hạng nhất/nhì/ba/khuyến khích.
- [ ] Đối soát thu chi rồi đặt `finance.published: true`.

## Kỹ thuật

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm --filter @webminton/frontend typecheck`,
      `pnpm test`, `pnpm validate`, `pnpm build`, `pnpm test:e2e` đều xanh.
- [ ] `terraform fmt -check -recursive infra` và `terraform -chdir=infra validate`.
- [ ] Bootstrap state bucket, cấu hình OIDC role và GitHub environment `prod`.
- [ ] Đọc `infra/README.md` và xử lý xong hai bước chuyển đổi state nếu tài
      khoản từng chạy stack cũ.
- [ ] `terraform -chdir=infra plan` không xoá bucket hay distribution ngoài dự kiến.
- [ ] Kiểm tra keyboard focus, skip link, và `prefers-reduced-motion`.
- [ ] `node --import tsx scripts/smoke-deployment.ts` sau khi triển khai.

Production release requires explicit AWS account/environment approval. Until
then, the application is safe to validate locally.
