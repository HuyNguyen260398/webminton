import type { Metadata } from "next";
import "../../styles/referee.css";

export const metadata: Metadata = {
  title: "Trọng tài · Giải cầu lông nội bộ 2026",
  robots: { index: false, follow: false },
};

export default function RefereeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
