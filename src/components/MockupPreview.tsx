'use client';

import { useEffect } from 'react';

/**
 * 목업 미리보기: 현재 조판(사진+여백)을 흰 액자에 넣어
 * 선반 위·벽 앞에 놓인 장면으로 합성해 보여준다.
 *
 * 장면(벽·유리 선반·그림자·반사)은 전부 CSS로 그려 외부 이미지 의존이 없다.
 * `url`은 재단 영역만 캡처한 PNG dataURL, 비율은 widthMm:heightMm.
 */
export default function MockupPreview({
  url,
  widthMm,
  heightMm,
  onClose,
}: {
  url: string;
  widthMm: number;
  heightMm: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const aspect = widthMm / heightMm;
  // 액자가 장면 높이에서 차지할 비율(선반 윗면까지). 세로 사진은 높게.
  const frameHeightPct = aspect >= 1 ? 50 : 66;
  const shelfTopPct = 80;

  // 액자(흰 몰딩 + 흰 매트지 + 인쇄물). heightPct = 장면 높이 대비 %
  const Frame = ({ heightPct }: { heightPct: number }) => (
    <div style={{ height: `${heightPct}%`, aspectRatio: String(aspect) }}>
      <div
        className="h-full w-full rounded-[3px] bg-white"
        style={{ padding: '2.4%', border: '1px solid #e7e5e1', boxShadow: '0 2px 2px rgba(0,0,0,0.10), 0 18px 34px rgba(0,0,0,0.22)' }}
      >
        <div className="flex h-full w-full items-center justify-center bg-white" style={{ padding: '6%' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="액자 미리보기"
            className="h-full w-full object-contain"
            style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.06), inset 0 0 12px rgba(0,0,0,0.05)' }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div
          className="relative w-full"
          style={{ aspectRatio: '3 / 2', background: 'linear-gradient(180deg,#efeeeb 0%,#e9e8e4 68%,#e3e2de 100%)' }}
        >
          {/* 벽 광원 */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(120% 90% at 30% 20%, rgba(255,255,255,0.45), transparent 60%)' }}
          />

          {/* 유리에 비친 반사 (액자 아래) */}
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 overflow-hidden"
            style={{
              top: `${shelfTopPct}%`,
              height: `${frameHeightPct * 0.5}%`,
              aspectRatio: String(aspect),
              transform: 'translateX(-50%) scaleY(-1)',
              opacity: 0.14,
              maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.7), transparent 65%)',
              WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.7), transparent 65%)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full rounded-[2px] object-contain bg-white" />
          </div>

          {/* 액자 */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: `${shelfTopPct - frameHeightPct}%` }}>
            <Frame heightPct={frameHeightPct} />
          </div>

          {/* 접지 그림자 */}
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2"
            style={{
              top: `${shelfTopPct - 1}%`,
              height: '3%',
              width: `${frameHeightPct * aspect * 1.08}%`,
              background: 'radial-gradient(60% 100% at 50% 0%, rgba(0,0,0,0.30), transparent 72%)',
              filter: 'blur(2px)',
            }}
          />

          {/* 유리 선반 상판 + 금속 다리 */}
          <div className="absolute inset-x-[15%]" style={{ top: `${shelfTopPct}%` }}>
            <div
              className="h-2.5 w-full rounded-[2px]"
              style={{
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.75), rgba(214,220,224,0.5) 45%, rgba(150,160,168,0.55))',
                borderTop: '1px solid rgba(255,255,255,0.9)',
                borderBottom: '1px solid rgba(120,130,140,0.6)',
                boxShadow: '0 6px 10px rgba(0,0,0,0.10)',
              }}
            />
            <div className="absolute left-[6%] top-2.5 h-[70px] w-[3px] rounded bg-gradient-to-b from-stone-400 to-stone-300 sm:h-[110px]" />
            <div className="absolute right-[6%] top-2.5 h-[70px] w-[3px] rounded bg-gradient-to-b from-stone-400 to-stone-300 sm:h-[110px]" />
          </div>
        </div>

        {/* 상단 바 */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <span className="rounded-full bg-black/45 px-3 py-1 text-xs text-white backdrop-blur">
            액자 주문 시 참고용 미리보기
          </span>
          <button
            onClick={onClose}
            className="rounded-full bg-black/55 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-black/70"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
