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
