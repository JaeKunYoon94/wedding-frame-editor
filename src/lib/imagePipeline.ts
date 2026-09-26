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
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.98 });
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

  // 원본 보관용 재인코딩이므로 PNG는 무손실 그대로, JPEG는 최고 품질로 저장해
  // 회전 보정 과정에서 화질이 깎이지 않게 한다.
  const outType = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const quality = outType === 'image/jpeg' ? 1 : undefined;
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? blob), outType, quality),
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

/**
 * 출력 직전: 원본을 인쇄에 실제로 필요한 픽셀 폭(targetW)으로 고품질 축소한다.
 * 왜: 큰 원본(4000~8000px)을 Konva가 한 번에 크게 줄여 그리면 캔버스 기본 보간(imageSmoothingQuality 'low')
 * 때문에 머리카락·레이스 같은 잔무늬에 계단·모아레가 생긴다. 절반씩 단계적으로 줄이면(각 단계 'high')
 * 박스 필터에 가까운 결과가 나오고, 마지막엔 Konva가 거의 1:1로 그리기만 한다.
 * 필요 이상 큰 원본을 디코딩한 채 들고 있지 않아 모바일 메모리 부담도 준다.
 * 원본이 이미 targetW 이하면 확대하지 않고 그대로 돌려준다(확대로는 화질이 늘지 않음).
 * 결과는 PNG(무손실) — 최종 JPEG/PNG 인코딩 전에 손실을 한 번 더 얹지 않기 위함.
 */
export async function resizeForPrint(blob: Blob, targetW: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const target = Math.max(1, Math.round(targetW));
  if (bitmap.width <= target) {
    bitmap.close();
    return blob;
  }
  const ratio = bitmap.height / bitmap.width;
  let src: CanvasImageSource = bitmap;
  let w = bitmap.width;
  let h = bitmap.height;
  let canvas: HTMLCanvasElement | null = null;
  while (w > target) {
    // 한 단계에 절반 넘게 줄이지 않는다 — 'high' 보간도 2배 이상 축소에선 픽셀을 건너뛰기 때문
    const nextW = Math.max(target, Math.ceil(w / 2));
    const nextH = nextW === target ? Math.max(1, Math.round(target * ratio)) : Math.ceil(h / 2);
    const next = document.createElement('canvas');
    next.width = nextW;
    next.height = nextH;
    const ctx = next.getContext('2d');
    if (!ctx) break;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, nextW, nextH);
    if (canvas) canvas.width = 0; // 이전 단계 캔버스 메모리를 즉시 반납
    canvas = next;
    src = next;
    w = nextW;
    h = nextH;
  }
  bitmap.close();
  if (!canvas) return blob;
  const out = await new Promise<Blob | null>((resolve) => canvas!.toBlob(resolve, 'image/png'));
  canvas.width = 0;
  return out ?? blob;
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
