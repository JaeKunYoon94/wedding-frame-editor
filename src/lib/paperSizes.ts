import type { PaperSize } from "@/types";

export const PAPER_SIZES: PaperSize[] = [
  { id: "A4", label: "A4", widthMm: 210, heightMm: 297 },
  { id: "B4", label: "B4", widthMm: 257, heightMm: 364 },
  { id: "A3", label: "A3", widthMm: 297, heightMm: 420 },
  { id: "4x6", label: "4×6", widthMm: 102, heightMm: 152 },
  { id: "5x7", label: "5×7", widthMm: 127, heightMm: 178 },
  { id: "8x10", label: "8×10", widthMm: 203, heightMm: 254 },
];

/** Custom 규격 제한: 최소 50×50mm ~ 최대 A2(420×594mm), 정수 mm */
export const CUSTOM_MIN_MM = 50;
export const CUSTOM_MAX_W_MM = 420;
export const CUSTOM_MAX_H_MM = 594;

export function validateCustomSize(w: number, h: number): string | null {
  if (!Number.isInteger(w) || !Number.isInteger(h)) return "mm는 정수로 입력해주세요.";
  if (w < CUSTOM_MIN_MM || h < CUSTOM_MIN_MM) return "최소 " + CUSTOM_MIN_MM + "mm 이상이어야 합니다.";
  const lo = Math.min(w, h);
  const hi = Math.max(w, h);
  if (lo > CUSTOM_MAX_W_MM || hi > CUSTOM_MAX_H_MM)
    return "A2(420×594mm) 초과 규격은 지원하지 않습니다.";
  return null;
}
