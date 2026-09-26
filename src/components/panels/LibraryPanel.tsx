'use client';

import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { processUpload } from '@/lib/imagePipeline';
import { useEditorStore } from '@/stores/editorStore';

/**
 * 기획안 v2 §7·§11: 좌측(모바일: 시트) 사진 목록.
 * Drag & Drop + 파일 선택, HEIC 변환 중 스피너 표시.
 *
 * 터치 환경에서는 HTML5 드래그가 동작하지 않으므로, 사진을 탭해 고른 뒤
 * 캔버스의 슬롯을 탭해 배치하는 경로를 함께 제공한다.
 */
export default function LibraryPanel({
  placingId = null,
  onPlacingChange,
}: {
  placingId?: string | null;
  onPlacingChange?: (id: string | null) => void;
}) {
  const library = useEditorStore((s) => s.library);
  const addLibraryItems = useEditorStore((s) => s.addLibraryItems);
  // "배치됨" 표시에는 배치된 사진의 src만 필요 — 사진 위치·줌 변경에는 반응하지 않도록 문자열로 구독
  // (blob: URL에는 공백이 없으므로 공백을 구분자로 쓴다)
  const placedSrcKey = useEditorStore((s) => s.photos.map((p) => p.src).join(' '));
  const placedSrcs = useMemo(() => new Set(placedSrcKey.split(' ')), [placedSrcKey]);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      setError(null);
      setPendingCount(files.length);
      // 한 장씩 순차 처리: 고해상도 사진을 동시에 디코딩하면 모바일에서 메모리가 부족해 탭이 죽을 수 있다.
      // 형식·크기 검증(실제 디코딩 결과 기준)은 processUpload가 하고, 실패 이유는 내부 구현을 노출하지 않게 뭉뚱그린다.
      for (const file of files) {
        try {
          const item = await processUpload(file);
          addLibraryItems([item]);
        } catch {
          setError(`${file.name} 처리에 실패했습니다.`);
        } finally {
          setPendingCount((n) => n - 1);
        }
      }
    },
    [addLibraryItems],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // 파일 선택 창·드롭의 1차 필터(MIME 허용 목록). 확장자 위장은 processUpload의 디코딩 검증에서 걸러진다.
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': [],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
    },
  });

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-lg border border-dashed p-5 text-center text-sm transition-all ${
          isDragActive
            ? 'scale-[1.02] border-accent bg-accent-soft'
            : 'border-accent/40 bg-paper hover:border-accent hover:bg-accent-soft/50'
        }`}
      >
        <input {...getInputProps()} />
        {/* 모바일(터치)엔 파일 드래그가 없으므로 '눌러서 추가'로 안내한다 — 화면 폭(lg) 기준이라 태블릿 가로 모드에선 데스크탑 문구가 보일 수 있다 */}
        <p className="font-display text-base text-ink">
          <span className="lg:hidden">눌러서 사진 추가하기</span>
          <span className="hidden lg:inline">사진을 여기로 드래그해주세요</span>
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          <span className="hidden lg:inline">또는 눌러서 파일 선택 · </span>JPG/PNG/WEBP/HEIC
        </p>
      </div>

      {library.length > 0 && (
        <p className="text-xs text-ink-muted">
          {placingId ? '캔버스의 슬롯을 눌러 배치하세요' : '사진을 눌러 고른 뒤 슬롯을 누르세요'}
        </p>
      )}

      <p className="text-xs text-ink-muted">사진은 내 기기를 벗어나지 않습니다.</p>
      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="grid flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto lg:grid-cols-2">
        {library.map((item, i) => {
          const picked = placingId === item.id;
          const placed = placedSrcs.has(item.src);
          return (
            <button
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-library-id', item.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onPlacingChange?.(picked ? null : item.id)}
              className={`relative aspect-square touch-manipulation cursor-grab overflow-hidden rounded-sm border bg-sheet transition-colors hover:border-accent active:cursor-grabbing ${
                picked ? 'border-accent ring-2 ring-accent/40' : 'border-line'
              }`}
              style={{ WebkitTouchCallout: 'none' }}
              title={`${i + 1}. ${item.fileName}${placed ? ' (배치됨)' : ''} — 눌러서 고르기 / 슬롯으로 드래그`}
            >
              {/*
                img는 draggable=false + pointer-events-none. 이걸 켜두면(또는 포인터 이벤트를
                직접 받으면) 두 가지 모바일 문제가 생긴다:
                1) 썸네일을 드롭존으로 끌 때 브라우저가 이미지를 '파일'처럼 넘겨 중복 업로드됨
                2) iOS/Android가 이미지 길게 누르기(저장/공유 메뉴)로 탭을 가로채 배치 탭이 씹힘
                모든 포인터 이벤트는 상위 button이 받도록 img는 완전히 통과시킨다.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src}
                alt={item.fileName}
                draggable={false}
                className={`pointer-events-none h-full w-full select-none object-cover transition-opacity ${placed ? 'opacity-40' : ''}`}
                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
              />

              {/* 순번 배지 */}
              <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink/75 px-1 text-xs font-semibold text-white">
                {i + 1}
              </span>

              {/* 이미 배치된 사진 표시 */}
              {placed && !picked && (
                <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-xs text-white">
                  배치됨
                </span>
              )}
              {picked && (
                <span className="absolute inset-x-0 bottom-0 bg-accent/90 py-0.5 text-xs text-white">
                  선택됨
                </span>
              )}
            </button>
          );
        })}
        {Array.from({ length: pendingCount }).map((_, i) => (
          <div
            key={`pending-${i}`}
            className="flex aspect-square items-center justify-center rounded-sm border border-line bg-paper"
          >
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" />
          </div>
        ))}
      </div>
    </div>
  );
}
