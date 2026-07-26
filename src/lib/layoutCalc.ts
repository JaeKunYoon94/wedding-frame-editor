import type { GutterMm, LayoutCell, LayoutType, Margins, Orientation, SingleShape } from '@/types';

export const ZERO_MARGINS: Margins = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * 제공하는 레이아웃 장수. 슬롯은 항상 정사각형(1:1)이며,
 * 격자는 1×1 / 2×2 / 3×3 / 4×4 로 배치한다.
 */
export const LAYOUT_COUNTS = [1, 4, 9, 16] as const satisfies readonly LayoutType[];

/**
 * 기획안 v2 §6: 레이아웃 변형은 용지 방향에 따라 자동 결정.
 * - 1장: 1×1
 * - 4장: 2×2
 * - 9장: 3×3
 * - 16장: 4×4
 * 슬롯은 정사각형(1:1)이며, 남는 여백은 그리드를 가운데 정렬해 흡수한다.
 * 셀 좌표는 재단선 기준 mm (bleed 제외 영역). margins는 변마다 독립 지정 가능.
 */
export function calcCells(
  paperWmm: number,
  paperHmm: number,
  layout: LayoutType,
  orientation: Orientation,
  gutterMm: GutterMm,
  margins: Margins = ZERO_MARGINS,
  /** 1장일 때만 사용: 'square' 정사각형 / 'rect' 용지 비율로 꽉 채움 */
  singleShape: SingleShape = 'rect',
): LayoutCell[] {
  const innerW = paperWmm - margins.left - margins.right;
  const innerH = paperHmm - margins.top - margins.bottom;

  const grid = (cols: number, rows: number): LayoutCell[] => {
    // 슬롯은 정사각형: 가로/세로로 가능한 셀 크기 중 작은 쪽을 한 변으로 쓴다.
    const maxCellW = (innerW - gutterMm * (cols - 1)) / cols;
    const maxCellH = (innerH - gutterMm * (rows - 1)) / rows;
    const side = Math.max(0, Math.min(maxCellW, maxCellH));

    // 정사각형화로 남는 공간은 그리드 전체를 가운데 정렬해 흡수한다.
    const gridW = cols * side + gutterMm * (cols - 1);
    const gridH = rows * side + gutterMm * (rows - 1);
    const originX = margins.left + (innerW - gridW) / 2;
    const originY = margins.top + (innerH - gridH) / 2;

    const cells: LayoutCell[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          id: `cell-${r}-${c}`,
          x: originX + c * (side + gutterMm),
          y: originY + r * (side + gutterMm),
          width: side,
          height: side,
        });
      }
    }
    return cells;
  };

  switch (layout) {
    case 1:
      // 정사각형(square) 또는 용지 비율로 꽉 채운 직사각형(rect)
      return singleShape === 'square'
        ? grid(1, 1)
        : [{ id: 'cell-0-0', x: margins.left, y: margins.top, width: innerW, height: innerH }];
    case 4:
      return grid(2, 2);
    case 9:
      return grid(3, 3);
    case 16:
      return grid(4, 4);
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
