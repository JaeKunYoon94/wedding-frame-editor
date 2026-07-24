'use client';

import { useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import PaperCanvas from '@/components/canvas/PaperCanvas';
import LibraryPanel from '@/components/panels/LibraryPanel';
import SettingsPanel from '@/components/panels/SettingsPanel';
import { useEditorStore } from '@/stores/editorStore';
import { useAutoSave } from '@/hooks/useAutoSave';
import { exportStageToImage, exportStageToPdf } from '@/lib/exportPdf';
import { mmToScreenPx } from '@/lib/convertMM';

type MobileTab = 'photos' | 'settings' | null;

export default function Editor() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [tab, setTab] = useState<MobileTab>(null);
  const { widthMm, heightMm, bleedMm, select } = useEditorStore();
  useAutoSave();

  // Undo/Redo 단축키 (기획안 v2 §8)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = useEditorStore.temporal.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? t.redo() : t.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleExport = (format: 'png' | 'jpg' | 'pdf') => {
    const stage = stageRef.current;
    if (!stage) return;
    select(null); // 선택 테두리가 출력물에 찍히지 않도록
    // TODO(1차 내): 추출 직전 src → originalKey 원본으로 교체 렌더링 (기획안 v2 §10)
    requestAnimationFrame(() => {
      const spec = {
        totalWmm: widthMm + bleedMm * 2,
        totalHmm: heightMm + bleedMm * 2,
        stageWidthPx: stage.width(),
      };
      const name = `wedding-frame-${widthMm}x${heightMm}`;
      if (format === 'pdf') exportStageToPdf(stage, spec, `${name}.pdf`);
      else exportStageToImage(stage, spec, format, `${name}.${format}`);
    });
  };

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      {/* 상단 바 */}
      <header className="flex h-12 items-center justify-between border-b border-stone-200 bg-white px-3">
        <h1 className="text-sm font-semibold">웨딩 액자 에디터</h1>
        <div className="flex gap-1.5">
          <button
            className="rounded border border-stone-300 px-2 py-1 text-xs"
            onClick={() => useEditorStore.temporal.getState().undo()}
          >
            ↩ 실행취소
          </button>
          <button
            className="rounded border border-stone-300 px-2 py-1 text-xs"
            onClick={() => useEditorStore.temporal.getState().redo()}
          >
            ↪ 다시실행
          </button>
        </div>
      </header>

      {/* 데스크탑: 3패널 (기획안 v2 §11) */}
      <div className="hidden flex-1 overflow-hidden md:flex">
        <aside className="w-64 shrink-0 border-r border-stone-200 bg-white">
          <LibraryPanel />
        </aside>
        <main className="flex-1">
          <PaperCanvas stageOut={stageRef} />
        </main>
        <aside className="w-72 shrink-0 border-l border-stone-200 bg-white">
          <SettingsPanel onExport={handleExport} />
        </aside>
      </div>

      {/* 모바일: 캔버스 + 하단 탭 바텀시트 (기획안 v2 §11) */}
      <div className="flex flex-1 flex-col overflow-hidden md:hidden">
        <main className="flex-1">
          <PaperCanvas stageOut={stageRef} />
        </main>
        {tab && (
          <div className="max-h-[45dvh] overflow-y-auto border-t border-stone-200 bg-white">
            {tab === 'photos' ? <LibraryPanel /> : <SettingsPanel onExport={handleExport} />}
          </div>
        )}
        <nav className="flex border-t border-stone-200 bg-white">
          {(
            [
              ['photos', '사진'],
              ['settings', '설정·다운로드'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(tab === key ? null : key)}
              className={`flex-1 py-3 text-sm ${tab === key ? 'font-semibold text-accent' : 'text-stone-500'}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
