import exifr from 'exifr';
import { saveOriginal } from './storage';
import type { LibraryItem } from '@/types';

/**
 * 기획안 v2 §7 업로드 파이프라인.
 * File → (HEIC이면 JPEG 변환) → EXIF 회전 보정 → 원본 IndexedDB 보관
 *      → 장변 2000px 다운스케일 편집용 이미지 생성
 */
const EDIT_MAX_LONG_EDGE = 2000;

function isHeic(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

async function toDecodableBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  // heic2any는 window 의존 → 동적 import (SSR 회피)
  const heic2any = (await import('heic2any')).default;
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  return Array.isArray(converted) ? converted[0] : converted;
}

/** EXIF Orientation(1~8)을 캔버스 변환으로 정방향 보정 */
async function normalizeOrientation(blob: Blob): Promise<Blob> {
  let orientation = 1;
  try {
    orientation = (await exifr.orientation(blob)) ?? 1;
  } catch {
    orientation = 1;
  }
  if (orientation === 1) return blob;

  const bitmap = await createImageBitmap(blob);
  const swap = orientation >= 5;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;

  const w = bitmap.width;
  const h = bitmap.height;
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? blob), 'image/jpeg', 0.95),
  );
}

async function downscale(blob: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const long = Math.max(bitmap.width, bitmap.height);
  if (long <= EDIT_MAX_LONG_EDGE) {
    const { width, height } = bitmap;
    bitmap.close();
    return { blob, width, height };
  }
  const scale = EDIT_MAX_LONG_EDGE / long;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const out: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', 0.9),
  );
  return { blob: out, width: canvas.width, height: canvas.height };
}

export async function processUpload(file: File): Promise<LibraryItem> {
  const decodable = await toDecodableBlob(file);
  const normalized = await normalizeOrientation(decodable);

  const originalKey = `orig-${crypto.randomUUID()}`;
  await saveOriginal(originalKey, normalized);

  const edit = await downscale(normalized);
  return {
    id: crypto.randomUUID(),
    src: URL.createObjectURL(edit.blob),
    originalKey,
    naturalWidth: edit.width,
    naturalHeight: edit.height,
    fileName: file.name,
  };
}
