import StartLink from "@/components/StartLink";

// 랜딩: 서비스 한 줄 소개 + 에디터 진입.
// DESIGN.md의 product-tile 구조 — 파치먼트 면 위에 태그라인 → 좁은 자간의 큰 제목 → 17px 본문 → 블루 pill CTA. 장식 없이 순서대로 떠오르는 입장 모션만.
export default function Landing() {
  return (
    <main className="bg-atmosphere flex min-h-dvh flex-col items-center justify-center px-6 py-20 text-center text-ink">
      <p className="animate-rise-in font-display text-[21px] leading-[1.19] tracking-[0.011em]">웨딩 액자 에디터</p>
      <h1 className="animate-rise-in mt-3 max-w-3xl font-display text-[34px] leading-[1.1] tracking-[-0.005em] [animation-delay:120ms] sm:text-[40px] lg:text-[56px] lg:leading-[1.07]">
        결혼식 사진, 3분 안에
        <br />
        액자 파일로.
      </h1>
      <p className="animate-rise-in mt-5 max-w-lg text-[17px] leading-[1.47] tracking-[-0.022em] text-neutral-500 [animation-delay:220ms]">
        용지를 고르고, 사진을 끌어다 놓고, 다운로드하세요. 화면에서 보는 그대로 300dpi로 출력됩니다.
        사진은 내 기기를 벗어나지 않습니다.
      </p>
      <StartLink />
    </main>
  );
}
