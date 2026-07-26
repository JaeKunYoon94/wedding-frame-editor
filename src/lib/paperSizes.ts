import type { PaperSize } from "@/types";

/**
 * 실제로 인쇄에 주로 쓰이는 A 시리즈만 제공한다.
 * (모두 세로 기준 mm. 가로는 orientation 토글로 파생)
 */
export const PAPER_SIZES: PaperSize[] = [
  { id: "A2", label: "A2", widthMm: 420, heightMm: 594 },
  { id: "A3", label: "A3", widthMm: 297, heightMm: 420 },
  { id: "A4", label: "A4", widthMm: 210, heightMm: 297 },
  { id: "A5", label: "A5", widthMm: 148, heightMm: 210 },
];

export const DEFAULT_PAPER_ID = "A4";

export function getPaperSize(id: string): PaperSize | undefined {
  return PAPER_SIZES.find((p) => p.id === id);
}

/** Custom 규격 제한: 최소 50×50mm ~ 최대 A2(420×594mm), 정수 mm */
export const CUSTOM_MIN_MM = 50;
export const CUSTOM_MAX_W_MM = 420;
export const CUSTOM_MAX_H_MM = 594;

export function validateCustomSize(w: number, h: number): string | null {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return "숫자를 입력해주세요.";
  if (!Number.isInteger(w) || !Number.isInteger(h)) return "mm는 정수로 입력해주세요.";
  if (w < CUSTOM_MIN_MM || h < CUSTOM_MIN_MM) return "최소 " + CUSTOM_MIN_MM + "mm 이상이어야 합니다.";
  const lo = Math.min(w, h);
  const hi = Math.max(w, h);
  if (lo > CUSTOM_MAX_W_MM || hi > CUSTOM_MAX_H_MM)
    return "A2(420×594mm) 초과 규격은 지원하지 않습니다.";
  return null;
}
