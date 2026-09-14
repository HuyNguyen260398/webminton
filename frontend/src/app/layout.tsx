import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Giải cầu lông nội bộ 2026 · Hội lông thủ CN1416",
  description:
    "Bốn đội, ba nội dung, hai mươi bốn trận gói gọn trong một buổi — thông tin giải, thể lệ thi đấu và nhà tài trợ.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="poster-ground">
        <a className="skip" href="#main">
          Đến nội dung chính
        </a>
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
