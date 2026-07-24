import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "웨딩 액자 에디터",
  description:
    "결혼식 사진을 업로드해 액자 출력용 300dpi 인쇄 파일을 3분 안에 만드세요. 사진은 내 기기를 벗어나지 않습니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
