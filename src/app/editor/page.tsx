"use client";

import dynamic from "next/dynamic";

// react-konva는 SSR 불가 → 클라이언트 전용 로드
const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

export default function EditorPage() {
  return <Editor />;
}
