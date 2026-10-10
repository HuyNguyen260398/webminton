import type { Metadata } from "next";
import "../../styles/admin.css";

export const metadata: Metadata = {
  title: "Quản trị · Giải cầu lông nội bộ 2026",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
