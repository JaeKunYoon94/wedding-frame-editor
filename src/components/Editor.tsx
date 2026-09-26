'use client';

// 에디터 껍데기: 상단 바와 3패널(데스크탑)/바텀시트(모바일) 배치, Undo·내보내기·목업 캡처 흐름을 관리한다.
// 사진·작업 상태는 editorStore(메모리)와 IndexedDB 원본 저장소를 쓴다.

import { useCallback, useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import PaperCanvas from '@/components/canvas/PaperCanvas';
import PhotoToolbar from '@/components/canvas/PhotoToolbar';
import LibraryPanel from '@/components/panels/LibraryPanel';
import SettingsPanel from '@/components/panels/SettingsPanel';
import FramePanel from '@/components/panels/FramePanel';
import MockupPreview from '@/components/MockupPreview';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/stores/editorStore';
import { clearOriginals } from '@/lib/storage';
import { captureTrimDataUrl, exportStageToImage, exportStageToPdf } from '@/lib/exportPdf';
import { FRAME_PREVIEW_ENABLED } from '@/lib/frames';
import { forgetSampleIds, isSampleId, loadSampleItems } from '@/lib/samples';

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
  /** true가 되면 배치된 사진이 고화질 원본으로 교체 렌더링된 상태 (PaperCanvas가 신호) */
  const [originalsReady, setOriginalsReady] = useState(false);
  /** 목업 미리보기: 캡처 중 여부 + 캡처된 인쇄물 dataURL */
  const [capturing, setCapturing] = useState(false);
  const [mockupUrl, setMockupUrl] = useState<string | null>(null);
  /** 탭-투-배치로 고른 라이브러리 사진 (터치 환경에서 드래그 대체) */
  const [placingId, setPlacingId] = useState<string | null>(null);
  // 에디터 껍데기는 용지 크기만 알면 되므로 필요한 값만 구독 (드래그·선택마다 전체가 다시 렌더되지 않게)
  const { widthMm, heightMm, bleedMm, select } = useEditorStore(
    useShallow((s) => ({ widthMm: s.widthMm, heightMm: s.heightMm, bleedMm: s.bleedMm, select: s.select })),
  );
  // 복구 기능이 없으므로 지난 세션의 원본 사진은 쓸모가 없다 — 진입 시 비워 기기에 쌓이지 않게 한다.
  // 스토어는 모듈 싱글턴이라 SPA 이동(뒤로가기 후 재진입)에도 사진이 남아 있으므로, 그땐 쓰는 중인 원본을 지우지 않는다.
  // 실패해도(IndexedDB 차단 등) 편집에는 지장이 없으므로 조용히 넘긴다.
  useEffect(() => {
    if (useEditorStore.getState().library.length === 0) clearOriginals().catch(() => {});
  }, []);

  // 샘플 모드: 라이브러리에 샘플 사진이 들어 있는 상태. '에디팅'으로 돌아가면 샘플만 걷어내고 내 사진은 그대로 둔다.
  const sampleMode = useEditorStore((s) => s.library.some((l) => isSampleId(l.id)));
  const [loadingSamples, setLoadingSamples] = useState(false);

  const enterSampleMode = async () => {
    if (sampleMode || loadingSamples) return;
    setLoadingSamples(true);
    try {
      const items = await loadSampleItems();
      const st = useEditorStore.getState();
      st.addLibraryItems(items);
      // 비어 있는 슬롯을 샘플로 채워 바로 이동·확대·필터를 시험해 볼 수 있게 한다
      const filled = new Set(st.photos.map((p) => p.cellId));
      st.cells
        .filter((c) => !filled.has(c.id))
        .forEach((c, i) => items[i] && useEditorStore.getState().assignToCell(items[i].id, c.id));
    } finally {
      setLoadingSamples(false);
    }
  };

  const exitSampleMode = () => {
    const samples = useEditorStore.getState().library.filter((l) => isSampleId(l.id));
    if (samples.length === 0) return;
    const ids = samples.map((l) => l.id);
    useEditorStore.getState().removeLibraryItems(ids);
    forgetSampleIds(ids);
    setPlacingId(null);
    // 실행취소로 샘플이 되살아나면 이미 해제된 blob: URL을 가리키게 되므로 히스토리를 비운다
    useEditorStore.temporal.getState().clear();
    samples.forEach((l) => URL.revokeObjectURL(l.src));
    // ponytail: 샘플 원본(IndexedDB)은 남겨두고 다음 진입 시 clearOriginals로 정리 — 키 단위 삭제가 필요해지면 storage에 추가
  };

  // PaperCanvas의 memo된 슬롯까지 전달되는 콜백이라 참조를 고정한다
  const handlePlaced = useCallback(() => setPlacingId(null), []);
  const handleOriginalsReady = useCallback(() => setOriginalsReady(true), []);

  /** export 모드 stage에서 재단 영역(bleed 안쪽)만 잘라낼 화면 px 좌표 */
  const trimCrop = useCallback(
    (stage: Konva.Stage) => {
      // export 모드의 stage 폭(px) = (용지 + bleed×2)mm 이므로 역산하면 px/mm 배율
      const scale = stage.width() / (widthMm + bleedMm * 2);
      const bleedPx = bleedMm * scale;
      return { x: bleedPx, y: bleedPx, width: widthMm * scale, height: heightMm * scale };
    },
    [widthMm, heightMm, bleedMm],
  );

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
    setOriginalsReady(false);
    setPending(format); // → 가이드·액자가 꺼지고 원본 이미지로 교체된 뒤 useEffect에서 추출
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
          setMockupUrl(captureTrimDataUrl(stage, trimCrop(stage)));
        } finally {
          setCapturing(false);
        }
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [capturing, trimCrop]);

  // 가이드(회색 bleed·재단선·안전선)와 액자가 화면에서 사라지고, 배치된 사진이
  // 편집용 다운스케일 이미지 대신 고화질 원본으로 교체된 프레임에서만 추출한다.
  useEffect(() => {
    if (!pending || !originalsReady) return;
    const stage = stageRef.current;
    // Konva batchDraw가 반영되도록 두 프레임 대기
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(async () => {
        try {
          if (!stage) return;
          const spec = { pageWmm: widthMm, pageHmm: heightMm, crop: trimCrop(stage) };
          const name = `wedding-frame-${widthMm}x${heightMm}`;
          // PDF는 저장 시점에 jsPDF를 불러오므로 끝날 때까지 기다려 '내보내는 중' 표시를 유지한다
          if (pending === 'pdf') await exportStageToPdf(stage, spec, `${name}.pdf`);
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
  }, [pending, originalsReady, widthMm, heightMm, trimCrop]);

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
      {/* 상단 바(DESIGN.md sub-nav-frosted: 반투명 흰 면 + 블러): 워드마크 + 샘플/에디팅 전환 + 실행취소/다시실행. 모바일 터치 타깃 44px(h-11) 확보 */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line bg-sheet/80 px-3 backdrop-blur-xl backdrop-saturate-150 lg:h-12 lg:px-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* 좁은 화면에선 버튼 자리를 위해 워드마크를 숨긴다 */}
          <h1 className="hidden truncate font-display text-base sm:block">
            웨딩 액자 <span className="text-accent">에디터</span>
          </h1>
          <div role="group" aria-label="작업 모드" className="flex shrink-0 rounded-full border border-line bg-paper p-0.5">
            {(
              [
                ['sample', loadingSamples ? '불러오는 중…' : '샘플', enterSampleMode],
                ['edit', '에디팅', exitSampleMode],
              ] as const
            ).map(([key, label, onClick]) => {
              const active = (key === 'sample') === (sampleMode || loadingSamples);
              return (
                <button
                  key={key}
                  onClick={onClick}
                  aria-pressed={active}
                  disabled={loadingSamples}
                  className={`h-10 whitespace-nowrap rounded-full px-3.5 text-xs transition-colors lg:h-7 ${
                    active ? 'bg-ink text-paper' : 'text-neutral-600 hover:text-accent'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            className="h-11 whitespace-nowrap rounded-full border border-line px-3.5 text-xs text-neutral-700 transition-colors hover:border-accent hover:text-accent lg:h-8"
            onClick={() => useEditorStore.temporal.getState().undo()}
          >
            실행취소
          </button>
          <button
            className="h-11 whitespace-nowrap rounded-full border border-line px-3.5 text-xs text-neutral-700 transition-colors hover:border-accent hover:text-accent lg:h-8"
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
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-line bg-sheet lg:block">
          {libraryPanel}
        </aside>

        <main className="relative min-w-0 flex-1 touch-none">
          <PaperCanvas
            stageOut={stageRef}
            mode={pending || capturing ? 'export' : 'edit'}
            placingId={placingId}
            onPlaced={handlePlaced}
            useOriginals={pending !== null}
            onOriginalsReady={handleOriginalsReady}
          />
          {/* 데스크탑 전용 — 모바일은 캔버스가 좁아 사진을 가리므로 바텀시트의 '선택한 사진' 도구를 쓴다 */}
          <div className="hidden lg:block">
            <PhotoToolbar />
          </div>
        </main>

        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-line bg-sheet lg:block">
          {FRAME_PREVIEW_ENABLED && <FramePanel />}
          {settings}
        </aside>
      </div>

      {/* 모바일·태블릿 바텀시트: 탭 전환마다 key로 다시 마운트해 살짝 올라오는 모션을 준다 */}
      {tab && (
        <div
          key={tab}
          className="max-h-[48dvh] shrink-0 animate-sheet-up overflow-y-auto rounded-t-2xl border-t border-line bg-sheet lg:hidden"
        >
          {tab === 'photos' ? libraryPanel : tab === 'frame' && FRAME_PREVIEW_ENABLED ? <FramePanel /> : settings}
        </div>
      )}
      <nav className="flex shrink-0 border-t border-line bg-sheet pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(tab === key ? null : key)}
            aria-pressed={tab === key}
            className={`relative min-h-11 flex-1 py-3 text-sm transition-colors ${tab === key ? 'font-semibold text-accent' : 'text-neutral-500'}`}
          >
            {/* 활성 탭 상단 표시선 */}
            <span
              aria-hidden
              className={`absolute inset-x-1/4 top-0 h-0.5 rounded-full bg-accent transition-opacity ${tab === key ? 'opacity-100' : 'opacity-0'}`}
            />
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
