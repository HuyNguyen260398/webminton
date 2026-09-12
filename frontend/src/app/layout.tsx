import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  title: "Webminton · Giải cầu lông nội bộ 2026",
  description:
    "Hội lông thủ CN1416 — thông tin giải, danh sách VĐV, bốc thăm và lịch thi đấu.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <a className="skip" href="#main">
          Đến nội dung chính
        </a>
        <header>
          <div className="nav-wrap">
            <Link className="brand" href="/">
              <span>W</span>WEBMINTON
              <span
                style={{
                  background: "none",
                  color: "inherit",
                  fontSize: 11,
                  letterSpacing: 1,
                }}
              >
                {" "}
                / CN1416
              </span>
            </Link>
            <nav className="nav-links" aria-label="Điều hướng chính">
              <Link href="/">Trang chủ</Link>
              <Link href="/van-dong-vien/">Vận động viên</Link>
              <Link href="/boc-tham/">Bốc thăm</Link>
              <Link href="/lich-thi-dau/">Lịch thi đấu</Link>
              <Link href="/thu-chi/">Thu chi</Link>
              <Link className="admin-link" href="/quan-tri/">
                Ban tổ chức ↗
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="footer">
          <div className="container">
            <div>
              <strong>HỘI LÔNG THỦ CN1416</strong>
              <br />
              <small>Cùng lên sân. Cùng hết mình.</small>
            </div>
            <small>
              Giải cầu lông nội bộ 2026
              <br />
              Đánh hết sức · Thua hết hồn · Nhậu hết mình
            </small>
          </div>
        </footer>
      </body>
    </html>
  );
}
