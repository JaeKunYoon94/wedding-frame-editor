import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// 폰트는 next/font가 빌드 시 받아 자체 호스팅한다 — 런타임에 외부(구글) 요청이 나가지 않는다 (시큐어 코딩 규칙).
// 제목·본문 모두 Noto Sans KR 하나로 통일한다(모든 기기에서 같은 글꼴). 크기·자간·굵기 위계는 DESIGN.md 타이포 토큰을 따른다.
// 굵기 사다리는 300/400/600 (500은 쓰지 않음 — DESIGN.md Typography Principles).
// 한글 폰트는 'korean' 서브셋 미리 로드가 지원되지 않아 preload를 끄고 unicode-range로 필요한 조각만 받는다.
// 캔버스(Konva) 텍스트는 자체 fontFamily를 쓰므로 출력물에는 영향이 없다.
const sans = Noto_Sans_KR({
  weight: ["300", "400", "600"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "웨딩 액자 에디터",
  description:
    "결혼식 사진을 업로드해 액자 출력용 300dpi 인쇄 파일을 3분 안에 만드세요. 사진은 내 기기를 벗어나지 않습니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={sans.variable}>
      <body className="bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
