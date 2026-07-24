import Link from "next/link";

export default function Landing() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-6 text-center text-ink">
      <p className="text-xs tracking-[0.3em] text-accent">WEDDING FRAME EDITOR</p>
      <h1 className="max-w-xl text-3xl font-semibold leading-snug md:text-4xl">
        결혼식 사진, 3분 안에
        <br />
        인쇄소에 바로 보낼 액자 파일로
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-stone-500">
        용지를 고르고, 사진을 끌어다 놓고, 다운로드하세요. 화면에서 보는 그대로 300dpi로
        출력됩니다. 사진은 내 기기를 벗어나지 않습니다.
      </p>
      <Link
        href="/editor"
        className="rounded-md bg-ink px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        지금 만들기
      </Link>
    </main>
  );
}
