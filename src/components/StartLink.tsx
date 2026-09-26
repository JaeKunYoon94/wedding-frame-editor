'use client';

// 랜딩의 "지금 만들기" 버튼: 누른 직후부터 에디터 화면이 뜰 때까지 여는 중 상태를 보여준다.
// (에디터 경로는 첫 진입 시 코드 로드·개발 서버 컴파일로 몇 초 걸릴 수 있어, 눌렀는지 모르는 공백을 없앤다)

import Link from 'next/link';
import { useState } from 'react';

export default function StartLink() {
  const [pending, setPending] = useState(false);

  return (
    <Link
      href="/editor"
      // 새 탭 열기(Ctrl/⌘·가운데 클릭)는 이 화면을 떠나지 않으므로 여는 중 상태로 바꾸지 않는다
      onClick={(e) => !(e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) && setPending(true)}
      aria-busy={pending}
      // DESIGN.md button-store-hero: Action Blue pill, 18px/300, 14×28px 패딩
      className="animate-rise-in group mt-9 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-button-large font-light text-white transition-colors [animation-delay:320ms] hover:bg-accent-focus"
    >
      {pending ? (
        <>
          <span
            aria-hidden
            className="h-3.5 w-3.5 rounded-full border-2 border-paper/30 border-t-paper motion-safe:animate-spin"
          />
          에디터 여는 중…
        </>
      ) : (
        <>
          지금 만들기
          <span aria-hidden className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </>
      )}
    </Link>
  );
}
