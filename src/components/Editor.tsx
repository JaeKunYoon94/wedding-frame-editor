'use client';

import { useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import PaperCanvas from '@/components/canvas/PaperCanvas';
import LibraryPanel from '@/components/panels/LibraryPanel';
import SettingsPanel from '@/components/panels/SettingsPanel';
import FramePanel from '@/components/panels/FramePanel';
import MockupPreview from '@/components/MockupPreview';
import { useEditorStore } from '@/stores/editorStore';
import { useAutoSave } from '@/hooks/useAutoSave';
import { captureTrimDataUrl, exportStageToImage, exportStageToPdf } from '@/lib/exportPdf';
import { FRAME_PREVIEW_ENABLED } from '@/lib/frames';

type MobileTab = 'photos' | 'frame' | 'settings' | null;
type ExportFormat = 'png' | 'jpg' | 'pdf';

const MOBILE_TABS: Array<[Exclude<MobileTab, null>, string]> = [
  ['photos', '사진'],
  ...(FRAME_PREVIEW_ENABLED ? ([['frame', '액자']] as Array<[Exclude<MobileTab, null>, string]>) : []),
  ['settings', '설정·저장'],
];

export default function Editor() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [tab, setTab] = useState<MobileTab>(null);
  const [pending, setPending] = useState<ExportFormat | null>(null);
  /** 목업 미리보기: 캡처 중 여부 + 캡처된 인쇄물 dataURL */
  const [capturing, setCapturing] = useState(false);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  /** 탭-투-배치로 고른 라이브러리 사진 (터치 환경에서 드래그 대체) */
  const [placingId, setPlacingId] = useState<string | null>(null);
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

  const handleExport = (format: ExportFormat) => {
    if (!stageRef.current) return;
    select(null); // 선택 테두리가 출력물에 찍히지 않도록
    setPending(format); // → 가이드·액자가 꺼진 상태로 리렌더된 뒤 useEffect에서 추출
  };

  const handlePreview = () => {
    if (!stageRef.current) return;
    select(null);
    setCapturing(true); // → 가이드가 꺼진 프레임에서 캡처 후 목업 모달 오픈
  };

  // 가이드가 사라진 프레임에서 재단 영역만 캡처해 목업 미리보기용 이미지를 만든다.
  useEffect(() => {
    if (!capturing) return;
    const stage = stageRef.current;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        try {
          if (!stage) return;
          const scale = stage.width() / (widthMm + bleedMm * 2);
          const bleedPx = bleedMm * scale;
          const url = captureTrimDataUrl(stage, {
            x: bleedPx,
            y: bleedPx,
            width: widthMm * scale,
            height: heightMm * scale,
          });
          setMockupUrl(url);
        } finally {
          setCapturing(false);
        }
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [capturing, widthMm, heightMm, bleedMm]);

  // 가이드(회색 bleed·재단선·안전선)와 액자가 화면에서 사라진 프레임에서만 추출한다.
  useEffect(() => {
    if (!pending) return;
    const stage = stageRef.current;
    // TODO(1차 내): 추출 직전 src → originalKey 원본으로 교체 렌더링 (기획안 v2 §10)
    // Konva batchDraw가 반영되도록 두 프레임 대기
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        try {
          if (!stage) return;
          // export 모드의 stage 폭(px) = (용지 + bleed×2)mm 이므로 역산하면 px/mm 배율
          const scale = stage.width() / (widthMm + bleedMm * 2);
          const bleedPx = bleedMm * scale;
          const spec = {
            pageWmm: widthMm,
            pageHmm: heightMm,
            crop: {
              x: bleedPx,
              y: bleedPx,
              width: widthMm * scale,
              height: heightMm * scale,
            },
          };
          const name = `wedding-frame-${widthMm}x${heightMm}`;
          if (pending === 'pdf') exportStageToPdf(stage, spec, `${name}.pdf`);
          else exportStageToImage(stage, spec, pending, `${name}.${pending}`);
        } finally {
          setPending(null);
        }
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [pending, widthMm, heightMm, bleedMm]);

  const libraryPanel = <LibraryPanel placingId={placingId} onPlacingChange={setPlacingId} />;

  const settings = (
    <SettingsPanel
      onExport={handleExport}
      onPreview={handlePreview}
      exporting={pending !== null || capturing}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-paper text-ink">
      {/* 상단 바 */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-stone-200 bg-white px-3">
        <h1 className="truncate text-sm font-semibold">웨딩 액자 에디터</h1>
        <div className="flex gap-1.5">
          <button
            className="whitespace-nowrap rounded border border-stone-300 px-2 py-1 text-xs"
            onClick={() => useEditorStore.temporal.getState().undo()}
          >
            실행취소
          </button>
          <button
            className="whitespace-nowrap rounded border border-stone-300 px-2 py-1 text-xs"
            onClick={() => useEditorStore.temporal.getState().redo()}
          >
            다시실행
          </button>
        </div>
      </header>

      {/*
        캔버스는 단 하나만 마운트한다 (Konva Stage 중복 생성 방지).
        데스크탑: 좌 라이브러리 / 중앙 캔버스 / 우 설정 3패널 (기획안 v2 §11)
        모바일: 캔버스 전체 + 하단 탭 바텀시트
      */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-stone-200 bg-white lg:block">
          {libraryPanel}
        </aside>

        <main className="min-w-0 flex-1 touch-none">
          <PaperCanvas
            stageOut={stageRef}
            mode={pending || capturing ? 'export' : 'edit'}
            placingId={placingId}
            onPlaced={() => setPlacingId(null)}
          />
        </main>

        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-stone-200 bg-white lg:block">
          {FRAME_PREVIEW_ENABLED && <FramePanel />}
          {settings}
        </aside>
      </div>

      {/* 모바일·태블릿 바텀시트 */}
      {tab && (
        <div className="max-h-[48dvh] shrink-0 overflow-y-auto border-t border-stone-200 bg-white lg:hidden">
          {tab === 'photos' ? libraryPanel : tab === 'frame' && FRAME_PREVIEW_ENABLED ? <FramePanel /> : settings}
        </div>
      )}
      <nav className="flex shrink-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(tab === key ? null : key)}
            className={`flex-1 py-3 text-sm ${tab === key ? 'font-semibold text-accent' : 'text-stone-500'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {mockupUrl && (
        <MockupPreview
          url={mockupUrl}
          widthMm={widthMm}
          heightMm={heightMm}
          onClose={() => setMockupUrl(null)}
        />
      )}
    </div>
  );
}
