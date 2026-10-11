import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bốc thăm chia đội · Giải cầu lông nội bộ 2026",
  description:
    "Chọn tên, bấm bốc thăm, nhận đội. Mỗi người một lần, không bốc lại.",
};

export default function TeamDrawLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
