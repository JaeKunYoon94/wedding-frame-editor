'use client';

import { useCallback, useState } from 'react';
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
  const { library, addLibraryItems, photos } = useEditorStore();
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      setError(null);
      setPendingCount(files.length);
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
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': [],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
    },
  });

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors ${
          isDragActive ? 'border-accent bg-amber-50' : 'border-stone-300 bg-stone-50'
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-stone-600">사진을 여기로 드래그해주세요</p>
        <p className="mt-1 text-xs text-stone-400">또는 눌러서 파일 선택 · JPG/PNG/WEBP/HEIC</p>
      </div>

      {library.length > 0 && (
        <p className="text-xs text-stone-500">
          {placingId ? '캔버스의 슬롯을 눌러 배치하세요' : '사진을 눌러 고른 뒤 슬롯을 누르세요'}
        </p>
      )}

      <p className="text-xs text-stone-400">사진은 내 기기를 벗어나지 않습니다.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="grid flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto lg:grid-cols-2">
        {library.map((item, i) => {
          const picked = placingId === item.id;
          const placed = photos.some((p) => p.src === item.src);
          return (
            <button
              key={item.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-library-id', item.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onPlacingChange?.(picked ? null : item.id)}
              className={`relative aspect-square touch-manipulation cursor-grab overflow-hidden rounded-md border bg-white active:cursor-grabbing ${
                picked ? 'border-accent ring-2 ring-accent/40' : 'border-stone-200'
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
              <span className="absolute left-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink/75 px-1 text-[11px] font-medium text-white">
                {i + 1}
              </span>

              {/* 이미 배치된 사진 표시 */}
              {placed && !picked && (
                <span className="absolute inset-x-0 bottom-0 bg-stone-800/70 py-0.5 text-[11px] text-white">
                  배치됨
                </span>
              )}
              {picked && (
                <span className="absolute inset-x-0 bottom-0 bg-accent/90 py-0.5 text-[11px] text-white">
                  선택됨
                </span>
              )}
            </button>
          );
        })}
        {Array.from({ length: pendingCount }).map((_, i) => (
          <div
            key={`pending-${i}`}
            className="flex aspect-square items-center justify-center rounded-md border border-stone-200 bg-stone-50"
          >
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-accent" />
          </div>
        ))}
      </div>
    </div>
  );
}
