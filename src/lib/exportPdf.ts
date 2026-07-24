import { jsPDF } from 'jspdf';
import type Konva from 'konva';
import { mmToExportPx } from './convertMM';

/**
 * 기획안 v2 §10 추출 파이프라인.
 * Konva stage.toDataURL({ pixelRatio }) → jsPDF 실측 mm 삽입.
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
export function canExportOnDevice(totalWmm: number, totalHmm: number): boolean {
  const limit = isMobileLike() ? MOBILE_MAX_EXPORT_PX : DESKTOP_MAX_EXPORT_PX;
  return mmToExportPx(totalWmm) <= limit && mmToExportPx(totalHmm) <= limit;
}

export interface ExportSpec {
  /** bleed 포함 전체 크기 mm */
  totalWmm: number;
  totalHmm: number;
  /** 현재 화면 stage 크기 px (pixelRatio 계산용) */
  stageWidthPx: number;
}

export function exportStageToPdf(stage: Konva.Stage, spec: ExportSpec, fileName: string): void {
  const pixelRatio = mmToExportPx(spec.totalWmm) / spec.stageWidthPx;
  const dataUrl = stage.toDataURL({ pixelRatio, mimeType: 'image/jpeg', quality: 0.95 });

  const orientation = spec.totalWmm >= spec.totalHmm ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [spec.totalWmm, spec.totalHmm],
  });
  pdf.addImage(dataUrl, 'JPEG', 0, 0, spec.totalWmm, spec.totalHmm);
  pdf.save(fileName);
}

export function exportStageToImage(
  stage: Konva.Stage,
  spec: ExportSpec,
  format: 'png' | 'jpg',
  fileName: string,
): void {
  const pixelRatio = mmToExportPx(spec.totalWmm) / spec.stageWidthPx;
  const dataUrl = stage.toDataURL({
    pixelRatio,
    mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
    quality: 0.95,
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}
