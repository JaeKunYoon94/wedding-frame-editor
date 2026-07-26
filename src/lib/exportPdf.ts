import { jsPDF } from 'jspdf';
import type Konva from 'konva';
import { mmToExportPx } from './convertMM';

/**
 * 기획안 v2 §10 추출 파이프라인.
 * Konva stage.toDataURL({ x, y, width, height, pixelRatio }) → jsPDF 실측 mm 삽입.
 *
 * 중요: 화면 가이드(bleed 회색 / 재단선 / 안전선 / 재단 표시선)는 출력물에 들어가면 안 되므로
 * 호출부(Editor)가 가이드를 끈 상태로 렌더한 뒤 재단 영역만 crop해서 넘긴다.
 * (원본 교체 렌더링은 PaperCanvas의 export 모드에서 처리)
 */

/** iOS Safari 등 모바일 캔버스 한계(대략 4096²~) 보수 기준 */
const MOBILE_MAX_EXPORT_PX = 4096;
const DESKTOP_MAX_EXPORT_PX = 8192;

export function isMobileLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/** 기획안 v2 §10: 추출 시도 전에 규격×기기 감지 */
export function canExportOnDevice(pageWmm: number, pageHmm: number): boolean {
  const limit = isMobileLike() ? MOBILE_MAX_EXPORT_PX : DESKTOP_MAX_EXPORT_PX;
  return mmToExportPx(pageWmm) <= limit && mmToExportPx(pageHmm) <= limit;
}

export interface ExportSpec {
  /** 출력 페이지 실측 mm (기본: 재단 후 용지 크기, bleed 포함 옵션 시 전체 크기) */
  pageWmm: number;
  pageHmm: number;
  /** stage에서 잘라낼 영역 (화면 px) */
  crop: { x: number; y: number; width: number; height: number };
}

function renderToDataUrl(
  stage: Konva.Stage,
  spec: ExportSpec,
  mimeType: 'image/png' | 'image/jpeg',
): string {
  // crop 폭이 정확히 300dpi 픽셀 수가 되도록 pixelRatio를 산출하고,
  // 높이는 폭에서 페이지 비율로 파생시킨다.
  // (폭·높이를 각각 반올림하면 비율이 어긋나 출력물이 미세하게 늘어난다)
  const width = spec.crop.width;
  const height = width * (spec.pageHmm / spec.pageWmm);
  let pixelRatio = mmToExportPx(spec.pageWmm) / width;

  // 기기 캔버스 한계(특히 모바일)를 넘으면 비율을 유지한 채 축소해 항상 추출되게 한다.
  // (A2·A3 300dpi는 모바일 한계를 초과 → dpi를 조금 낮춰서라도 다운로드 가능)
  const maxPx = isMobileLike() ? MOBILE_MAX_EXPORT_PX : DESKTOP_MAX_EXPORT_PX;
  const over = Math.max(width * pixelRatio, height * pixelRatio) / maxPx;
  if (over > 1) pixelRatio /= over;

  return stage.toDataURL({
    x: spec.crop.x,
    y: spec.crop.y,
    width,
    height,
    pixelRatio,
    mimeType,
    quality: 0.95,
  });
}

export function exportStageToPdf(stage: Konva.Stage, spec: ExportSpec, fileName: string): void {
  const dataUrl = renderToDataUrl(stage, spec, 'image/jpeg');

  const orientation = spec.pageWmm >= spec.pageHmm ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [spec.pageWmm, spec.pageHmm],
    compress: true,
  });
  // 페이지 = 용지 실측이므로 여백 없이 꽉 채워 배치
  pdf.addImage(dataUrl, 'JPEG', 0, 0, spec.pageWmm, spec.pageHmm);
  pdf.save(fileName);
}

/**
 * 목업 미리보기용: 재단 영역만 잘라 PNG dataURL로 캡처한다.
 * (추출과 달리 파일 저장 없이 화면 합성에만 쓰므로 targetW로 해상도를 낮춰 가볍게)
 */
export function captureTrimDataUrl(
  stage: Konva.Stage,
  crop: { x: number; y: number; width: number; height: number },
  targetW = 1200,
): string {
  const pixelRatio = targetW / crop.width;
  return stage.toDataURL({ ...crop, pixelRatio, mimeType: 'image/png' });
}

export function exportStageToImage(
  stage: Konva.Stage,
  spec: ExportSpec,
  format: 'png' | 'jpg',
  fileName: string,
): void {
  const dataUrl = renderToDataUrl(stage, spec, format === 'png' ? 'image/png' : 'image/jpeg');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}
