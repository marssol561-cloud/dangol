import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "리붐단골",
  description: "리붐단골 — 단골 고객 관리",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
