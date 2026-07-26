'use client';

import { FRAME_SAMPLES, MAT_COLORS } from '@/lib/frames';
import { useFrameStore } from '@/stores/frameStore';
import type { MatColor, MatWidthMm } from '@/types';

/**
 * 기획안 v2 §9: 액자 미리보기 패널.
 * 액자·매트지는 미리보기 전용이며 출력 파일에는 포함되지 않는다.
 */
export default function FramePanel() {
  const { frame, matWidthMm, matColor, setFrame, setMatWidth, setMatColor } = useFrameStore();
  const framed = frame !== 'none';

  return (
    <section className="border-b border-stone-200 p-3">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-stone-500">액자 미리보기</h3>

      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => setFrame('none')}
          className={`flex h-14 flex-col items-center justify-center rounded-md border text-xs transition-colors ${
            frame === 'none' ? 'border-accent ring-2 ring-accent/30' : 'border-stone-300 hover:border-stone-400'
          }`}
        >
          <span className="text-stone-500">없음</span>
        </button>
        {FRAME_SAMPLES.map((f) => (
          <button
            key={f.id}
            onClick={() => setFrame(f.id)}
            title={`${f.label} · 몰딩 ${f.widthMm}mm`}
            className={`flex h-14 flex-col items-center justify-end overflow-hidden rounded-md border p-1 transition-colors ${
              frame === f.id ? 'border-accent ring-2 ring-accent/30' : 'border-stone-300 hover:border-stone-400'
            }`}
          >
            <span
              className="mb-1 h-6 w-full rounded-sm border border-black/10"
              style={{ background: f.fill }}
            />
            <span className="text-[11px] leading-none text-stone-600">{f.label}</span>
          </button>
        ))}
      </div>

      {framed && (
        <div className="mt-3 space-y-2">
          <div>
            <p className="mb-1 text-xs text-stone-500">매트지 폭</p>
            <div className="flex gap-1.5">
              {([0, 30, 50] as MatWidthMm[]).map((w) => (
                <button
                  key={w}
                  onClick={() => setMatWidth(w)}
                  className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                    matWidthMm === w
                      ? 'border-accent bg-accent text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:border-stone-400'
                  }`}
                >
                  {w === 0 ? '없음' : w === 30 ? `좁게 ${w}mm` : `넓게 ${w}mm`}
                </button>
              ))}
            </div>
          </div>

          {matWidthMm > 0 && (
            <div>
              <p className="mb-1 text-xs text-stone-500">매트지 색상</p>
              <div className="flex gap-1.5">
                {(Object.keys(MAT_COLORS) as MatColor[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setMatColor(c)}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                      matColor === c ? 'border-accent ring-2 ring-accent/30' : 'border-stone-300 hover:border-stone-400'
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-sm border border-stone-300"
                      style={{ background: MAT_COLORS[c].fill }}
                    />
                    {MAT_COLORS[c].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-stone-400">
        액자·매트지는 화면 미리보기 전용(액자 주문 시 참고용)이며 출력 파일에는 포함되지 않습니다.
      </p>
    </section>
  );
}
