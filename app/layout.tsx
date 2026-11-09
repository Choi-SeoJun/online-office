import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "온라인 회사 · 오늘도 적당히",
  description: "출근은 했고, 일은 모르겠고. 딴짓하고, 상사를 골탕먹이고, 커피 한 잔 쉬어 가는 작은 3D 회사.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
