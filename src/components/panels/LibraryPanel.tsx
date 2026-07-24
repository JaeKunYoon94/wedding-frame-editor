'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { processUpload } from '@/lib/imagePipeline';
import { useEditorStore } from '@/stores/editorStore';

/**
 * 기획안 v2 §7·§11: 좌측(모바일: 시트) 사진 목록.
 * Drag & Drop + 파일 선택, HEIC 변환 중 스피너 표시.
 */
export default function LibraryPanel() {
  const { library, addLibraryItems } = useEditorStore();
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

      <p className="text-xs text-stone-400">사진은 내 기기를 벗어나지 않습니다.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto">
        {library.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/x-library-id', item.id)}
            className="aspect-square cursor-grab overflow-hidden rounded-md border border-stone-200 bg-white active:cursor-grabbing"
            title={`${item.fileName} — 슬롯으로 드래그해 배치`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.src} alt={item.fileName} className="h-full w-full object-cover" />
          </div>
        ))}
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
