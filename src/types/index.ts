/** 모든 좌표·크기는 mm 단위 (기획안 v2 §3: mm가 진실의 원천) */

export type Orientation = "portrait" | "landscape";
export type LayoutMode = "grid" | "free";
export type LayoutType = 1 | 4 | 9 | 16; // 정사각형 슬롯 격자: 1×1 / 2×2 / 3×3 / 4×4
/** 1장 레이아웃 슬롯 형태: 정사각형 / 용지 비율로 꽉 채운 직사각형 */
export type SingleShape = "square" | "rect";

/** 사진 테두리 디자인 (출력물에도 반영됨) */
export type PhotoFrame = "none" | "polaroid" | "life4cut";
export type BleedMm = 0 | 3 | 5;
/** 슬롯 간격(mm) — 용지 크기에 비례한 프리셋으로 선택 */
export type GutterMm = number;

/** 재단선 안쪽 상하좌우 여백(mm) — 변마다 독립적으로 조절 가능 */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** 기획안 v2 §9: 액자 미리보기 (출력물에는 포함되지 않음) */
export type FrameId = "none" | "black" | "white" | "wood" | "gold" | "silver";
export type MatWidthMm = 0 | 30 | 50;
export type MatColor = "white" | "ivory";

export interface PaperSize {
  id: string;
  label: string;
  /** 세로 기준 mm */
  widthMm: number;
  heightMm: number;
}

export interface LayoutCell {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Photo {
  id: string;
  /** 편집용 (장변 2000px 다운스케일) object URL */
  src: string;
  /** 추출용 원본 IndexedDB 키 */
  originalKey: string;
  naturalWidth: number;
  naturalHeight: number;

  x: number;
  y: number;
  width: number;
  height: number;

  rotation: number;
  scaleX: 1 | -1;
  scaleY: 1 | -1;
  /** 슬롯 내부 크롭 배율 (cover 기준 1.0 이상) */
  zoom: number;
  /** 슬롯 내부 오프셋 (mm) */
  offsetX: number;
  offsetY: number;

  brightness: number;
  contrast: number;
  saturation: number;
  /** 흑백 변환 여부 */
  grayscale: boolean;

  zIndex: number;
  cellId?: string;
}

export interface LibraryItem {
  id: string;
  src: string;
  originalKey: string;
  naturalWidth: number;
  naturalHeight: number;
  fileName: string;
}
