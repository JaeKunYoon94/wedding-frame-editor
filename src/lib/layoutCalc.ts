import type { GutterMm, LayoutCell, LayoutType, Orientation } from '@/types';

/**
 * 기획안 v2 §6: 레이아웃 변형은 용지 방향에 따라 자동 결정.
 * - 2장: 세로 → 상하 분할 / 가로 → 좌우 분할
 * - 4장: 2×2
 * - 6장: 세로 → 2열×3행 / 가로 → 3열×2행
 * 셀 좌표는 재단선 기준 mm (bleed 제외 영역).
 */
export function calcCells(
  paperWmm: number,
  paperHmm: number,
  layout: LayoutType,
  orientation: Orientation,
  gutterMm: GutterMm,
  marginMm = 0,
): LayoutCell[] {
  const innerW = paperWmm - marginMm * 2;
  const innerH = paperHmm - marginMm * 2;

  const grid = (cols: number, rows: number): LayoutCell[] => {
    const cellW = (innerW - gutterMm * (cols - 1)) / cols;
    const cellH = (innerH - gutterMm * (rows - 1)) / rows;
    const cells: LayoutCell[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          id: `cell-${r}-${c}`,
          x: marginMm + c * (cellW + gutterMm),
          y: marginMm + r * (cellH + gutterMm),
          width: cellW,
          height: cellH,
        });
      }
    }
    return cells;
  };

  switch (layout) {
    case 1:
      return grid(1, 1);
    case 2:
      return orientation === 'portrait' ? grid(1, 2) : grid(2, 1);
    case 4:
      return grid(2, 2);
    case 6:
      return orientation === 'portrait' ? grid(2, 3) : grid(3, 2);
  }
}

/**
 * cover 채움: 사진이 셀을 빈틈없이 채우는 최소 배율(zoom=1 기준)에서의
 * 표시 크기(mm)를 계산한다. 기획안 v2 §6 슬롯 고정 + 내부 크롭 방식.
 */
export function coverFit(
  cellW: number,
  cellH: number,
  naturalW: number,
  naturalH: number,
): { width: number; height: number } {
  const scale = Math.max(cellW / naturalW, cellH / naturalH);
  return { width: naturalW * scale, height: naturalH * scale };
}

/**
 * 셀 내부 오프셋 클램프: 사진 가장자리가 셀 안쪽으로 들어오지 않도록 제한.
 */
export function clampOffset(
  cellW: number,
  cellH: number,
  photoW: number,
  photoH: number,
  offsetX: number,
  offsetY: number,
): { offsetX: number; offsetY: number } {
  const maxX = Math.max(0, (photoW - cellW) / 2);
  const maxY = Math.max(0, (photoH - cellH) / 2);
  return {
    offsetX: Math.min(maxX, Math.max(-maxX, offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, offsetY)),
  };
}
