"use client";

import dynamic from "next/dynamic";

// react-konva는 SSR 불가 → 클라이언트 전용 로드.
// 에디터 청크(Konva 등)를 받는 동안 빈 화면 대신 파치먼트 배경 위 로딩 표시를 보여준다.
const Editor = dynamic(() => import("@/components/Editor"), {
  ssr: false,
  loading: () => (
    <div role="status" className="bg-atmosphere flex h-dvh flex-col items-center justify-center gap-4 text-ink">
      <span
        aria-hidden
        className="h-8 w-8 rounded-full border-2 border-accent/25 border-t-accent motion-safe:animate-spin"
      />
      <p className="font-display text-sm text-neutral-600">에디터를 준비하고 있어요…</p>
    </div>
  ),
});

export default function EditorPage() {
  return <Editor />;
}
